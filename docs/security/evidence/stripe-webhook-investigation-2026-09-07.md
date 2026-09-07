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

---

# Addendum, 7 September — the live account identified, and a second symptom of the same split

## The live Stripe account is `acct_1TcRj7RVZaURcx14`

Not guessed and not read from a secret. Stripe's own error responses to our production key carry it:

```
request_log_url: 'https://dashboard.stripe.com/acct_1TcRj7RVZaURcx14/workbench/logs?object=req_...'
x-stripe-routing-context-priority-tier: 'livemode-critical'
```

Eleven such lines across `createstripecheckoutsession` in the last 30 days. The `livemode` routing tier
confirms these were live-mode API calls, so this is the live account, not a sandbox.

**The browser session cannot reach it.** The Chrome profile is signed in to a Stripe user whose only
account is a *sandbox*, `acct_1UD6fMCaq9fK94tW` ("New business", UK, unnamed, onboarding incomplete,
**zero webhook endpoints**). Attempting to exit the sandbox returns *"Get your live account to exit
sandbox — we need to verify some information about you and your business"*, i.e. this login has no live
account at all. Navigating directly to `dashboard.stripe.com/acct_1TcRj7RVZaURcx14/webhooks` silently
redirects back to the sandbox — the login is not a member of the live account.

So the seven questions that need the dashboard remain open, and they need a different Stripe login.
Nothing was created, changed, verified or filled in; the onboarding form was left untouched.

## A second symptom, and it points at the same root cause

`createStripeCheckoutSession` produced **20 error entries in 30 days, all identical**:

```
StripeInvalidRequestError: No such customer: 'cus_Uc8H6JiloBcleq'
  at /workspace/stripeBilling.js:1475
```

That customer id is **stored on a live workspace document**:

| Field | Value |
|---|---|
| Workspace | `KSQide…` (truncated) |
| `billingCustomerId` | `cus_Uc8H6JiloBcleq` |
| `billingCustomerCreatedAt` | **2026-05-30** |
| `billingPlan` | `pro_monthly` |
| `billingProvider` | `shopify` |

Four of 63 workspaces carry a Stripe customer id at all; this is one of them.

**Why it matters, and why it is the same story.** The customer was created on **30 May** — ten days
before the 9 June boundary this report identifies, where the signing secret rotated to v4 and
test-mode events stopped while live-mode events began. A customer id minted before that boundary and
now presented to a **live** key produces exactly this error. It is the same test/live split as the
webhook 400s, seen from the other side: the webhook shows a signer we cannot verify, this shows a
customer we cannot fetch.

**It is customer-affecting in a way the webhook 400s were not.** Every checkout attempt from that
workspace fails with a 500. The mitigating detail is that `billingProvider` is `shopify`, so Stripe may
not be that workspace's real billing rail — but the code still tries, and still throws.

**Not fixed, nothing changed.** The smallest fix is to treat `resource_missing` on the stored customer
as "mint a new customer" rather than an unhandled error, which is a code change with its own deploy.
Recorded here so it is decided rather than rediscovered.

---

# Addendum 2, 7 September — the dashboard, read. All seven questions answered.

Read-only inspection of the Stripe Dashboard, Test mode OFF and ON, plus the sandboxes. Nothing was
rotated, deleted, resent or changed; no signing secret was revealed.

## The answer: two endpoints on one URL, in two different ACCOUNTS

The report's shape was right and its location was wrong. It predicted a live/test split **inside one
account**. The truth is a **live account and a separate sandbox account**, both pointing at the same
production URL.

| | **Working signer** | **Failing signer** |
|---|---|---|
| Account | **NivaDesk**, `acct_1TcRj7RVZaURcx14` (live) | **NivaDesk sandbox**, `acct_1TcRjHD3VBItFZ5T` |
| Destination ID | **`we_1TgKjqRVZaURcx14uD5VAzvu`** | **`we_1TcSpBD3VBItFZ5T9i6K9Ytj`** |
| Name | `dynamic-harmony` | **`NivaDesk Billing Webhook`** |
| Destination URL | `https://stripewebhook-ukbn4tcyca-nw.a.run.app` | **the same URL** |
| State | Active | Active |
| **Error rate** | **0 %** | **100 %** |
| Listening to | **4 events** | **6 events** |
| API version | 2026-04-22.dahlia | 2026-04-22.dahlia |
| Description | *(none)* | "Stripe subscription events for NivaDesk Lite, Pro and Team sandbox billing." |

The server holds exactly one `STRIPE_WEBHOOK_SECRET` (v4). It is the live endpoint's. The sandbox
endpoint signs with its own, and every one of its deliveries fails verification — hence a 100 % error
rate on one endpoint and 0 % on the other, from one URL, with one secret. **This is why the same
secret version on the same revision produced both 200s and 400s.**

**Live test mode is empty.** `acct_1TcRj7RVZaURcx14` in Test mode has **no endpoints at all** — only an
"Import · 1" offer. So the failing signer was never the live account's test mode, which is what the
first report inferred from the retry cadence.

## The dropped event types, and who they belong to

Every failed delivery on the sandbox endpoint is **`customer.subscription.deleted`**, `400 ERR`, source
Automatic. A worked example from the delivery detail:

```
Event ID     evt_1UClpED3VBItFZ5T4KL04WHi
Origin       Sep 6, 2026, 7:34:03 PM   (attempts 7:34:03, 7:34:18, 8:35:13 — three, then abandoned)
Description  review@nivadesk.app's subscription to price_1Tg8EpD3VBItFZ5T3oVrEm02 was canceled
```

Also failed: Aug 29 01:05:40, Aug 28 23:04:13, and the rest of the pattern the log analysis found.

**They are sandbox subscriptions belonging to `review@nivadesk.app`** — the internal review workspace,
one of the two addresses in `STRIPE_INTERNAL_TEST_EMAILS`. No paying customer's event was ever dropped.
That settles the severity question the first report left open on inference: **a tidy-up, not an
incident**, now on observed evidence rather than on the absence of complaints.

## A separate gap the dashboard exposed, which nobody was looking for

The handler switches on **six** event types. The two endpoints do not agree on which it receives:

| Event type | Sandbox endpoint | **Live endpoint** |
|---|---|---|
| `checkout.session.completed` | yes | yes |
| `customer.subscription.created` | yes | yes |
| `customer.subscription.updated` | yes | yes |
| `customer.subscription.deleted` | yes | yes |
| **`invoice.paid`** | yes | **NO** |
| **`invoice.payment_failed`** | yes | **NO** |

**Production does not subscribe to `invoice.paid` or `invoice.payment_failed`.** The code handles both
— `applyInvoicePaid` and `applyInvoicePaymentFailed` exist and are wired — but Stripe never sends them
to the live endpoint, so a renewal payment and a failed payment are both invisible in production. The
sandbox endpoint, ironically, is the one configured correctly.

This is not the cause of the 400s and it is not urgent while no live subscription exists. It matters
the moment one does: renewals would not be recorded and a failed payment would not be noticed. It is
also the reason the seven skipped `invoice.paid → invoice_without_subscription` rows in the ledger are
all test-mode — they could only ever have arrived from the sandbox.

## The seven questions, answered

| # | Question | Answer |
|---|---|---|
| 1 | Exact endpoint Stripe is calling | `https://stripewebhook-ukbn4tcyca-nw.a.run.app` — **both** endpoints target it |
| 2 | Which endpoint ID / account | Working `we_1TgKjqRVZaURcx14uD5VAzvu` on `acct_1TcRj7RVZaURcx14`; failing `we_1TcSpBD3VBItFZ5T9i6K9Ytj` on `acct_1TcRjHD3VBItFZ5T` |
| 3 | Does the configured secret match | Yes — for the live endpoint. It cannot match the sandbox one. **Do not rotate** |
| 4 | Duplicates / stale, or expected | Sandbox subscription cancellations for an internal review account, retried 3× then abandoned. Not events production expects |
| 5 | Which event types dropped | **`customer.subscription.deleted`** only, all from the sandbox |
| 6 | Should business state have changed | **No.** They concern `review@nivadesk.app` in a sandbox, not a paying workspace |
| 7 | Another active successful endpoint | Yes — the live one, 0 % error. No endpoint exists outside these two in this login's accounts |

## Smallest fix, not applied

Point the sandbox endpoint somewhere that is not production — a sandbox listener or a separate
function — or disable it. Do **not** add its secret as a second `defineSecret`: that would make the
production handler accept sandbox events signed by a sandbox key, and the live `STRIPE_SECRET_KEY`
could not fetch their objects anyway. Separately, and on its own merits, add `invoice.paid` and
`invoice.payment_failed` to the live endpoint before the next real subscription.

---

# Addendum 3, 7 September — the change that was made, and the one that was deliberately not

## Made: the sandbox endpoint is disabled

| | |
|---|---|
| Endpoint | `we_1TcSpBD3VBItFZ5T9i6K9Ytj` — "NivaDesk Billing Webhook" |
| Account | `acct_1TcRjHD3VBItFZ5T` (NivaDesk **sandbox**) |
| Was | Active, 6 events, pointing at the production URL, **100 % error rate** |
| Now | **Disabled** |
| Method | Dashboard → destination → **Disable** (not Delete, not Roll secret) |

Stripe's own confirmation text records why this is the reversible choice: *"Events will no longer be
sent to this destination, but you'll still be able to make edits to it."* Re-enabling is one click on
the same menu. **The signing secret was not rolled and nothing was deleted.**

Disable rather than re-point, for a reason worth writing down: there is no sandbox-appropriate URL to
re-point at, and the endpoint delivered nothing successfully anyway — a 100 % error rate means no
working capability is lost. What does stop is somebody's ability to exercise the sandbox billing flow
end to end, which is what the endpoint's own description says it was built for. If that is wanted back,
the answer is a sandbox listener, not this endpoint.

**Verified afterwards:** the live endpoint `we_1TgKjqRVZaURcx14uD5VAzvu` is untouched — still Active,
still 4 events, still 0 % error rate.

## NOT made: `invoice.paid` was not added to the live endpoint

This was the obvious next step and it would have been wrong. The handler that would receive those
events is **already broken on the API version both endpoints run**.

`applyInvoicePaid` (`functions/stripeBilling.js:1181`) reads:

```js
const subscriptionId = typeof invoice.subscription === "string"
  ? invoice.subscription : invoice.subscription?.id || "";
if (!subscriptionId) return { skipped: true, reason: "invoice_without_subscription" };
```

`invoice.subscription` was removed in newer API versions and moved under
`invoice.parent.subscription_details.subscription`. Both endpoints run **2026-04-22.dahlia**.

Not an inference — the production ledger settles it. Of every `invoice.paid` event that has ever
reached the handler:

```
  7  invoice.paid -> invoice_without_subscription (livemode=false, api=2026-04-22.dahlia)
```

**Seven of seven skipped.** A 100 % failure rate on that path.

So subscribing the live endpoint to `invoice.paid` today would deliver events to a handler that skips
every one. The webhook would show green, the ledger would fill with skipped rows, and renewals still
would not be recorded — a worse state than the current honest gap, because it looks fixed. The next
real subscription would be trusted to a rail that does not work.

**Correct order, and the reason for it:** fix the field read (with a fallback to the legacy shape so an
older API version still works), ship it, *then* add `invoice.paid` and `invoice.payment_failed` to the
live endpoint. The code fix is in progress on this branch; the endpoint change waits for it.

---

# Addendum 4, 7 September — the code fix landed; two operator steps have not

## Made, in code, on this branch

Both drifted reads now go through one resolver each, new location first and the legacy shape as a
fallback, so a replayed old event or an endpoint pinned back during a rollback still resolves:

- `stripeSubscriptionIdFromInvoice(invoice)` — `parent.subscription_details.subscription`, then
  `invoice.subscription`. Used by `applyInvoicePaid` and `applyInvoicePaymentFailed`.
- `stripeCurrentPeriodEndUnix(subscription)` — the earliest usable `items.data[].current_period_end`,
  then `subscription.current_period_end`. Used by `applySubscription`, the single choke point every
  Stripe ledger row is written through.

One more thing was wrong on the failure path and is fixed with them: `applyInvoicePaymentFailed`
returned `status: "past_due"` even when the subscription retrieve had thrown and nothing had moved the
workspace — a claim persisted verbatim into the `stripeBillingEvents` row next to
`processingStatus: "processed"`. It now reports `payment_failed_not_applied` with the reason.

**Nothing was deployed.** No `firebase deploy`, no Dashboard change, no secret touched.

## Still open — both need an operator, neither is code

**1. The two invoice events are still not on the live endpoint.** `we_1TgKjqRVZaURcx14uD5VAzvu` still
listens to exactly the four events recorded above: `checkout.session.completed`,
`customer.subscription.created`, `.updated`, `.deleted`. Adding `invoice.paid` and
`invoice.payment_failed` is now the correct move — that ordering was the whole point of Addendum 3 —
but until it is made *and the fix is deployed*, the invoice half of this work is correct code that
never runs, and renewals are still not being recorded. This is not "done".

**2. The five null ledger rows are not backfilled.** Read-only count taken today, aggregates only:

```
  9 subscription ledger rows in production
    stripe  5  — currentPeriodEnd null on all 5
    apple   3  — currentPeriodEnd set on all 3
    google  1  — currentPeriodEnd set
```

The change is forward-only. A Stripe row is repopulated when the next `customer.subscription.*`
webhook arrives for it, or when an owner presses **Refresh subscription access**
(`resyncStripeWorkspaceEntitlements` → `applySubscription`; the `subscriptions.list` objects it reads
do carry `items`, so that path backfills correctly). Nothing sweeps them on its own, and while a row
stays null the 36-hour grace window in `firestore.rules` / `storage.rules` has nothing to gate on and
the expiry reconcile's `where("billingCurrentPeriodEnd", "<", cutoff)` cannot match it.

Unlike the invoice half, the `current_period_end` half needs no endpoint change to start working:
`customer.subscription.updated` is already subscribed, so the first delivery after a deploy writes a
real date.

## One thing to watch in the logs

`subscription.items` is a paginated `ApiList` and an embedded sub-list returns at most ten entries. The
resolver cannot page it without becoming async, so instead it logs

```
  Stripe subscription items are paginated; the period end is the earliest of the FIRST PAGE only.
```

Today that line is unreachable — checkout creates exactly one line item. If it ever appears, a
subscription has more than ten items and the period end being written is the earliest of a page, not
of the subscription, which is the over-granting direction. That is the point at which the resolver has
to start paging.

---

# Addendum 4, 7 September — the invoice fix, and a second drift that was worse than the first

The fix asked for was `invoice.paid`. Establishing it properly surfaced a second field drift with a
wider blast radius, confirmed from the pinned SDK's own type definitions and then from production data.

## Two drifts, both proved from the SDK types

| | `applyInvoicePaid` | `applySubscription` |
|---|---|---|
| Read | `invoice.subscription` | `subscription.current_period_end` |
| Status in the pinned SDK | **removed** — no such member on `Invoice` (`Invoices.d.ts`, enumerated: `customer` :223, `parent` :344, `status` :393, `subtotal` :398, nothing in the gap where `subscription` sorts) | **removed** from `Subscription`; moved to each **item** (`SubscriptionItems.d.ts:50`) |
| Now reads | `invoice.parent.subscription_details.subscription` (`:852`, `string \| Subscription`) | `subscription.items.data[].current_period_end`, earliest wins |
| Legacy fallback | kept | kept |

Stripe's own wording corroborates the second: the list filter is documented as *"subscriptions whose
**minimum item** current_period_end"* (`Subscriptions.d.ts:2377`) — the field is per-item by design.

## Why the second drift is the more serious one

`invoice.subscription` broke one event type that production was not even subscribed to.
`current_period_end` is read in `applySubscription`, which is the choke point for **every**
`customer.subscription.*` event, both invoice handlers and the checkout completion. So it has been
silently null on every Stripe row since the API version moved.

Confirmed by data, with a clean control:

| Provider | Ledger rows | `currentPeriodEnd` populated |
|---|---|---|
| stripe | 5 | **0** |
| apple | 3 | 3 |
| google | 1 | 1 |

Apple and Google write the same field into the same collection through the same schema and land a
value. The field is not unwritten — only the Stripe read was empty.

### What that null touches, sized honestly

`billingCurrentPeriodEnd` appears in `firestore.rules:148-149` and `storage.rules:216-217`, inside
`trialLapsed()`. It is the **fallback** arm: a trialing workspace is judged lapsed by
`billingTrialEndsAt`, and only when that is absent does the rule fall back to
`billingCurrentPeriodEnd`. With the field always null, that fallback arm can never fire — a
defence-in-depth clause that has been dead for Stripe workspaces.

**How reachable is it today? Measured, not assumed:** of 63 workspaces, 5 have
`billingStatus == "trialing"`, and **all 5 carry `billingTrialEndsAt`**. The fallback arm is therefore
**not currently reachable** — this is a latent weakening, not a live hole. It also drives the sweeper
query `.where("billingCurrentPeriodEnd", "<", cutoff)` (`stripeBilling.js:2174`), which can never match
a null row, and backs an index in `firestore.indexes.json:12`.

## A third defect the same pass found: dunning never fires

`applyInvoicePaymentFailed` did not early-return on an empty id. It fell through, resolved the
workspace via `invoice.customer` (which still exists), stamped `billingPaymentFailedAt` and **looked
successful** — while `applySubscription` was never called, so the workspace **never moved to
`past_due`**. Latent rather than observed, since no `invoice.payment_failed` event has ever arrived,
but a fix that only patched `invoice.paid` would have left dunning broken and looking healthy.

## Verification, re-run independently

- `cd functions && npm test` → **exit 0, 1202 PASS, 0 FAIL**.
- `node test/qa/stripe-invoice-api-drift.test.js` → **exit 0, 26 checks**.
- **The original production defect, restored by hand**: reverting `applyInvoicePaid` to the removed
  `invoice.subscription` read turns the suite red on a *behavioural* check, not a textual one —
  `a dahlia invoice.paid records the renewal, dated from the item — the renewal was skipped:
  {"skipped":true,"reason":"invoice_without_subscription"}`. The production symptom is now an assertion.
- **The second drift, restored by hand**: reverting to `subscription.current_period_end` turns four
  checks red, including `billingCurrentPeriodEnd is not a Timestamp: null`.

That behavioural coverage did not exist in the first commit — every call-site check was a
`SOURCE.indexOf()`, so the production defect could be restored with the suite fully green. The
handlers are closures over an injected-dependency factory and could not be called at all; they are now
exported through the factory's existing `_internal` bag (which `index.js` already destructures away
before registering anything, so nothing new is deployable) and run against a fake Firestore and a fake
Stripe. 25 exact mutations, every one red.

**Not deployed. No backfill.** The change is forward-only: the 7 skipped events stay skipped and the 5
null ledger rows stay null until the next `customer.subscription.*` delivery for each. And the two
invoice events stay off the live endpoint until this code is reviewed and deployed — adding them first
would deliver to a handler that could not read them.

---

# Addendum 5, 7 September — the scope-frozen final review was NOT clean

One review, three behaviours, eight stress points. It found **four defects, two of them HIGH**, and the
worst one **was introduced by the patch itself**. Recording that plainly, because the deploy gate was
"if the review is clean".

## The two HIGH findings

**1. A stale event backdates the renewal, and the sweep then drops the workspace to Free Demo.**
Only the `customer.subscription.*` rail passed `event.created` down. `applyInvoicePaid` called
`applySubscription(subscription, "invoice.paid")` with no event time, so `eventCreatedMs` defaulted to
0 and `writeStripeSubscriptionLedger` skipped **both** the staleness check *and* the write of
`stripeEventSequence`. The renewal date it had just recorded was written **without raising the
watermark that protects it**. A late-arriving older `customer.subscription.*` event then rolled
`billingCurrentPeriodEnd` back to the pre-renewal date — a date already in the past — and the hourly
sweep selects exactly on `billingEffectiveStatus == "active" AND billingCurrentPeriodEnd < now-2h`,
flips the row to expired and recomputes the workspace to Free Demo.

**This path could not exist before the patch**, because every `invoice.paid` skipped before reaching
`applySubscription`. Making the path write is what created the exposure. `checkout.session.completed`
had the identical omission, and nine such events are already in production — but it fires once per
subscription where renewals recur monthly.

**2. `applyInvoicePaymentFailed` reported success when the subscription retrieve failed.** It caught
the error and returned, which `processStripeEvent` files as `processingStatus: "processed"` with a
`processedAt` — a 200 to Stripe saying the event was consumed, plus a dedupe row that refuses the
redelivery. A Stripe outage would have silently eaten the dunning event. Stress point (h), exactly.

## Fixed, and verified twice

`processStripeEvent` now computes `eventCreatedMs` once and hands it to all four rails; the three
appliers take and forward it, defaulting to 0 so the reconcile job and the owner's Refresh are still
never treated as stale. The retrieve error is held and re-thrown after the failure stamp lands, on both
exits — matching what `invoice.paid` has always done.

Suite **1202 → 1205 PASS**, drift checks **26 → 29**, exit 0. Eight new mutations plus a sample of the
original battery, all red.

**Re-verified independently, not taken on the review's word:**

| Mutation restored by hand | Result |
|---|---|
| `applyInvoicePaid` stops forwarding the event time | exit 1 — *"every webhook rail stamps the ledger's event sequence"* and *"a renewal raises the watermark that protects its own date"* |
| Both `if (retrieveError) throw retrieveError;` exits neutered | exit 1 — *"a failed subscription retrieve leaves the payment_failed event retryable — the handler reported success after the retrieve failed"* |

One correction to my own working: my first attempt at the second mutation was a no-op, because my
pattern expected `throw` at the start of a line and the code writes `if (retrieveError) throw
retrieveError;` on one. The suite passing there was my regex, not the code. Re-run correctly, it fails
as it should.

## Also established, and left alone

**Both legacy fallbacks are dead code on every path this deployment has.** Pinned SDK is stripe 22.1.1
at `2026-04-22.dahlia`, `stripeClient()` passes no `apiVersion` override, and all 42 recorded events
carry dahlia. The only way to reach a fallback is an operator pinning an endpoint back — the rollback
case the comments name. **Not removed: that is the operator's call, and out of a frozen scope.**

---

# Addendum 6, 7 September — the focused re-review found a state-corruption path. STOPPED, not deployed.

Seven frozen invariants, two lenses, every verdict driven through the real injected handlers via the
factory's `_internal` bag — no source-text assertions. Both reviewers left the tree clean at `62883afe`.

| Invariant | Verdict |
|---|---|
| 1. Every rail passes the real `event.created` | **HOLDS** — all five rails wrote `stripeEventSequence == event.created × 1000`; the owner Refresh and the reconcile job correctly are *not* treated as stale |
| 2. Nothing moves backwards | **VIOLATED** |
| 3. `payment_failed` cannot be falsely marked processed | **HOLDS** for every genuine failure |
| 4. Transient failure leaves the event retryable | **HOLDS** — the dedupe row does **not** refuse the retry |
| 5. Recovery converges | **HOLDS** in both orders |
| 6. New shape reads never silently null | **HOLDS** — no shape found where a value was present and the read returned empty |
| 7. Replay / dedupe | **HOLDS** sequentially; the concurrent case is a real check-then-write race that did not produce divergent state |

## The HIGH, found independently by both lenses from different directions

**A stale webhook re-grants a cancelled storage or team-seat add-on.** The ordering guard fires and the
ledger row is protected — and then the company document is written from the stale payload anyway.

Four links, each read in the shipped code:

1. `writeStripeSubscriptionLedger` returns `{ skipped: true, reason: "stale_subscription_event" }`
   (`stripeBilling.js:593`).
2. `applySubscription` calls it as a bare `await …` and **discards the return value** (`:1109`).
3. The `storage_addon` branch (`:1121`) and `team_seat_addon` branch (`:1138`) then write
   `workspace.ref.set({…})` directly from the stale payload and **`return` before the resolver runs** —
   so `recomputeEffectiveWorkspaceEntitlement`, which is what makes the plan rail safe, is never reached.
4. The re-granted fields are the ones the server **enforces** on: `activeAdditionalTeamSeats()`
   (`index.js:2409-2415`) reads `billingAdditionalTeamSeatQuantity` + `billingAdditionalTeamSeatStatus`,
   and the storage add-on check reads its pair.

Driven end to end: a Team workspace with 3 purchased seats and a 200 GB add-on, both cancelled at T2,
then a stale T1 event — the add-ons come back. **It is durable and self-sustaining**: the next plan
`invoice.paid` does not repair it.

## Three more state-corruption paths, reported not fixed

- **Equal `event.created` is applied, not skipped.** The guard is `eventSequence < seen` (`:591`) and
  Stripe's `created` has one-second granularity. Two conflicting events in the same second: last writer
  wins — observed moving `billingCurrentPeriodEnd` backwards and `billingStatus` active → trialing.
- **The ordering pre-read's catch is fail-OPEN** (`:595-597`). Making `ledgerRef.get()` throw once let a
  stale event apply in full, moving all three protected fields backwards **and** recording the event as
  processed, so no redelivery repairs it.
- **`applySubscription` reports `{updated: true}` for an event whose ledger write was stale-skipped**,
  and `processStripeEvent` persists that verbatim — the event record states the opposite of what happened.

## Pre-existing, and widened — not created by this patch

Checked rather than assumed. Before this patch, `processStripeEvent` already passed `event.created` on
the `customer.subscription.*` rail (`:1286` in the pre-patch file), so the guard already fired there and
**the add-on corruption is already live in production on that rail today**. What the patch does is
extend it to the `invoice.paid`, `invoice.payment_failed` and `checkout.session.completed` rails by
making them pass event time too. The ordering guard itself landed in `ce1fb764` (3 September), before
any of today's work.

**DEPLOY STOPPED.** The operator's gate was "deploy is approved if this review finds no new
HIGH/exploitable correctness blocker, otherwise STOP and report rather than entering another repair
loop." It found one, with a demonstrated state-corruption path. Nothing was deployed, nothing was
repaired, no endpoint event subscription was changed.

---

# Addendum 7, 7 September — the stale-event hotfix works, and introduces one regression. STOPPED.

Commit `d0c7f431`. **All four frozen invariants HOLD**, proved by driving the real injected handlers
through `_internal` against a fake Firestore and a fake Stripe — no source-text assertions anywhere.
Suite **1205 → 1218 PASS**, exit 0.

| Invariant | Verdict |
|---|---|
| 1. No mutation anywhere after a stale decision | **HOLDS** — all eight `workspace.ref` writes reachable from an event enumerated and each proved behind the gate, on all four rails, asserted over a whole-store snapshot rather than per-branch |
| 2. Ordering-read failure fails closed and stays retryable | **HOLDS** — the `received` row opens before dispatch, `processedAt` lands only after the applier returns, so a throw leaves the event retryable; the redelivery was driven and applies; the webhook answers 500, it does not swallow to 200 |
| 3. Equal `event.created` cannot race | **HOLDS, and it dissolves rather than being patched** — because what is applied is Stripe's canonical state, both members of a same-second tie write the same thing. Driven in both arrival orders; final projection byte-identical |
| 4. A skipped event is recorded truthfully | **HOLDS** on every rail — `processingStatus: "skipped"`, `result.skipped: true`, `result.updated` undefined |

The reviewer also checked its own probes were not vacuous: it temporarily reapplied the production
defect and watched the same probes reproduce the corruption byte for byte
(`{"addon":"storage_200gb","active":true}`, `billingStorageAddonMB 204800`; `{"purchasedSeatQuantity":3}`,
`billingTeamMemberLimit 8`).

## The HIGH: the fix leaks the free trial

**A stale `checkout.session.completed` no longer spends the once-per-workspace free trial, and nothing
ever repairs it.** This is a regression `d0c7f431` introduces, not a pre-existing bug.

Verified in the shipped code:

- `applyCompletedSubscriptionCheckout` stamps `billingTrialUsedAt` only inside
  `if (result.updated && result.workspaceId)` (`stripeBilling.js:1125-1131`).
- After the fix a stale checkout event returns `{skipped:true}` with no `updated`, so the stamp never
  lands. Before the fix it returned `{updated:true}` — because the skip was discarded — so it did.
- `billingTrialUsedAt` is the once-per-workspace trial guard, read at `index.js:2268`, `index.js:31880`
  and `stripeBilling.js:1813` (`hasUsedTrial`).

So the workspace can claim the fourteen-day trial again. Not state corruption — a revenue leak — but it
meets the operator's stop condition.

**The shape of the right answer, noted and NOT implemented.** `billingTrialUsedAt` is a *monotonic,
once-ever* fact: staleness is irrelevant to it, because "this workspace has at some point started a
trial" cannot become false by arriving late. The invariant "a stale event mutates nothing" is correct
for *state*, and wrong for *monotonic facts*. Separating those two classes is the fix; deciding to make
that separation is the operator's call.

## Four lesser findings, reported not fixed

- The watermark is a non-transactional read-modify-write, and the canonical retrieve widens the window
  between read and write by one Stripe API call. Demonstrated with interleaved deliveries.
- `invoice.paid`, `invoice.payment_failed` and `checkout.session.completed` retrieve the subscription in
  the *caller*, before `applySubscription` makes the stale decision — so a stale event on those three
  rails still costs one Stripe API call. (The `customer.subscription.*` rail costs zero, by design.)
- The commit message and the comment at `:1152-1156` claim the subscription's "id, its customer and its
  workspace metadata are immutable". **Stripe subscription metadata is mutable.** The claim is wrong as
  written even though the reasoning survives for id and customer.
- An event with no `created` is never stale and skips the ledger read entirely, so it carries no
  fail-closed exposure — noted as correct, not as a defect.

**DEPLOY STOPPED.** The operator's gate: "If it finds another state-corruption/HIGH path, STOP and
report." It found one. Nothing deployed, nothing repaired, no endpoint event list changed, `/f/`
untouched.
