# `NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN` — Secret Manager migration

**Status: written proposal. Nothing has been created, granted, deployed or committed.**
The value of this token appears nowhere in this file and must never be added to it.

Raised by `docs/ebay-runtime-service-account-proposal.md` §4.3, which found a sixth
credential-shaped value sitting outside the five-secret plan and covered by no IAM grant, and
recorded it as "a decision for the operator to confirm or change".

`gcloud` credentials were **expired** while this was written. Every claim below is established from
source in this worktree, or from facts recorded in the SA proposal while credentials were live.
Claims that need a live read are marked **[NEEDS LIVE VERIFICATION]** with the exact command.

---

## 1. What the value is, and who issues it

**We choose it. eBay does not issue it.** It is a shared secret the developer invents, types into
the eBay Developer Portal next to the notification endpoint URL, and the endpoint must then be able
to reproduce. eBay's only claim on it is its *shape*.

The constraints are eBay's, and the repo already encodes them
(`functions/commerce/ebay/notification.js:29`):

```js
const VERIFICATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,80}$/;
```

quoting eBay's Marketplace User Account Deletion page via `docs/ebay-connector-design.md:87`:
*"verification token has to be between 32 and 80 characters … alphanumeric … underscore (\_), and
hyphen (-)"*.

**It is HASHED, never echoed.** `notification.js:31-37`:

```js
function challengeResponse({ challengeCode, verificationToken, endpointUrl }) {
  return crypto.createHash("sha256")
    .update(String(challengeCode || ""))
    .update(String(verificationToken || ""))
    .update(String(endpointUrl || ""))
    .digest("hex");
}
```

`sha256hex(challengeCode + verificationToken + endpointUrl)`, in that exact order, with the endpoint
URL byte for byte as registered. The raw token never appears in a response body. The unit test at
`functions/test/qa/commerce-ebay-notification.test.js:11-16` pins both the order and the
byte-for-byte URL ("a trailing slash is a different URL").

Three consequences that drive the rest of this document:

1. **It is a genuine secret with a genuine reason to be one.** Anyone holding it can stand up a
   host, register it as our deletion endpoint, and answer eBay's challenge in our name.
2. **A wrong value cannot be detected by reading our own response.** The response is a hash. It is
   well-formed and 200 whether the token is right or wrong. Only eBay, which holds the other copy,
   can tell the difference.
3. **`openssl rand -hex 32` is inside eBay's charset; base64 is not.** 64 hex characters satisfy
   `{32,80}` and `[A-Za-z0-9_-]`. A base64 value would carry `+`, `/` or `=` and be rejected by our
   own guard before eBay ever saw it. Use hex.

---

## 2. Is it set anywhere today? No — and the fail direction is closed

**It is unset everywhere I can see, and there is no deploy surface in this worktree that sets it.**

| Surface | Result |
|---|---|
| `functions/.env` in this worktree (`studioflow-ebay`) | **does not exist** |
| `functions/.env` in the main checkout (`studioflow-app`) | exists; key names read without values — **no `NIVADESK_EBAY_*` key of any kind** |
| `functions/.env.example` | Stripe scaffold only; no eBay entry |
| `firebase.json` | no env block; `disallowLegacyRuntimeConfig: true`, so no `functions:config` path either |
| Anywhere else in the repo | only the two e2e tests, which assign `process.env` directly in-process |

The only assignments in the whole tree are test fixtures:
`functions/test/e2e/ebay-account-deletion-emulator.test.js:23` and
`functions/test/e2e/commerce-ebay-connector-emulator.test.js:27`, both
`"nivadesk_ebay_deletion-token_0123456789"`.

This is coherent rather than surprising: **no eBay `NIVADESK_*` variable is set** —
`NIVADESK_EBAY_ENVIRONMENT`, `RUNAME`, `DAILY_CAP`, `CONNECTOR`, `DELETION_ENDPOINT_URL` are all
absent too, matching `docs/ebay-functions-deploy-plan.md`'s verified finding that none of the
seventeen functions exists in Cloud Run and none of the five secrets exists in Secret Manager.
Nothing eBay is live.

### The fail-open / fail-closed question: it fails CLOSED, on the challenge only

`functions/ebayConnector.js:1770-1777`, the GET branch:

```js
const token = String(deletionToken() || "");
const endpoint = String(deletionEndpointUrl() || "");
if (!notification.isValidVerificationToken(token) || !endpoint) { res.status(503).json({ ok: false }); return; }
```

With the variable unset, `deletionToken()` returns `""` (`index.js:6198` `|| ""`), the pattern
rejects the empty string, and the challenge answers **503**. It does not compute a hash over an
empty token and return 200. That is the correct behaviour and it is closed.

`deletionEndpointUrl()` is not the failure here — `index.js:6199` defaults it to the live
`https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayNotifications`, so `endpoint` is
non-empty even unset. **The token alone is what makes the challenge answer 503 today.**

Note the contrast with `TRACK17_WEBHOOK_TOKEN`, which the comment at `index.js:21834` records as
having once failed *open* ("This used to fail OPEN: with `TRACK17_WEBHOOK_TOKEN` unset, every
request was …"). This one never did.

**The real finding is not the fail direction. It is the asymmetry in §3.**

---

## 3. Which of the seventeen read it, and on which path

**Exactly one function, on exactly one code path.**

| | |
|---|---|
| Function | `ebayNotifications` (`ebayConnector.js:1848`, `onRequest`, `europe-west2`) |
| Path | `handleNotificationRequest`, `method === "GET"` **and** `challenge_code` non-empty |
| Read site | `ebayConnector.js:1772`, via the injected getter `deletionToken` |
| Injection | `index.js:6198` |
| Factory default | `ebayConnector.js:163` — `deletionToken = () => ""` |

`grep -n "deletionToken" functions/ebayConnector.js` returns three lines and no more: the default at
:163, the read at :1772, and nothing else. **No other function in the eBay surface reads it. No
other code path in `ebayNotifications` reads it.** In particular:

- **The deletion POST path does not read it.** Its gate is `configured()`
  (`ebayConnector.js:1786`), and `configured()` is `() => Boolean(String(clientId() || "").trim())`
  (`:190`) — `EBAY_CLIENT_ID` only. A deletion notification is authenticated by eBay's ECDSA
  signature over the body, not by this token.
- `reconcileEbayDeletions`, `ebayEventWorker` and the `buyer_deletion` task path never touch it.

### The asymmetry, which is the finding

The token gates **only** the handshake that lets eBay register and re-validate the endpoint. It
gates **none** of the traffic that flows once registered. So:

> A token that is wrong, stale, or mismatched against the portal breaks nothing you can observe.
> Deletions keep arriving, keep verifying, keep being processed and keep being acknowledged 200.
> The damage is silent until eBay next validates the endpoint.

This is the **opposite failure shape** from the TRACK17 rotation of 2026-09-06, where the mismatch
broke inbound POSTs within seconds and produced a visible wall of 401s
(`docs/security/evidence/amazon/secret-exposure-2026-09-06.md`). That incident's residual risk was
loud and self-announcing. This one's is quiet. Design the procedure for that, not for TRACK17's.

**[NEEDS LIVE VERIFICATION — and it is a question for eBay, not for `gcloud`]** Whether eBay
re-issues the challenge to an *already registered* destination on a schedule, or only when the
destination is created or edited in the portal, I could not establish from the code or from the
design document, and I will not guess. If eBay only ever challenges at registration time, a
post-registration mismatch stays latent indefinitely and surfaces at the worst moment — the next
time the destination is touched. Confirm on the Notification API / Marketplace Account Deletion
pages in the Developer Portal before relying on any assumption either way. **The procedure in §7 is
written so that the answer does not matter**: the portal and Secret Manager are treated as one
atomic pair.

---

## 4. The code change

### 4.1 Name the secret after the environment variable it already is

Create the Secret Manager secret as **`NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN`** — the same name
as the variable.

`defineSecret(NAME)` mounts the value into `process.env[NAME]`, so with the names identical:

- `index.js:6198` needs **no change**. The getter keeps reading `process.env.…`.
- `ebayConnector.js` needs **no change at all**. It never knew where the value came from.
- Both e2e tests keep working unmodified: they set `process.env` directly, which is exactly the
  channel `defineSecret` uses.

This is also the house style — `NIVADESK_QBO_*` and `NIVADESK_XERO_*` are already
`NIVADESK_`-prefixed Secret Manager names (`index.js:148-166`). Renaming it to `EBAY_DELETION_TOKEN`
to match the five would buy cosmetic symmetry and cost a getter change plus two test edits, for no
functional gain. Don't.

### 4.2 The declaration

`functions/index.js:136-138`, one entry added to the existing array:

```js
const EBAY_SECRET_PARAMS = EBAY_SECRETS_READY
  ? [defineSecret("EBAY_CLIENT_ID"), defineSecret("EBAY_CLIENT_SECRET"), defineSecret("EBAY_TOKEN_KEY"), defineSecret("EBAY_HASH_KEY"), defineSecret("EBAY_CALLBACK_KEY"), defineSecret("NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN")]
  : [];
```

`EBAY_RUNTIME` (`:140`) is unchanged and every eBay trigger already spreads it, so all seventeen
mount the sixth secret and run as `ebay-connector@`. It stays behind the `.ebay-secrets-ready`
marker, exactly like the five.

### 4.3 This breaks a test that pins the literal. That is not incidental.

`functions/test/qa/commerce-ebay-wiring.test.js:22` asserts the array by regex, with all five
`defineSecret` calls spelled out:

```js
assert.ok(/const EBAY_SECRET_PARAMS = EBAY_SECRETS_READY\s*\?\s*\[defineSecret\("EBAY_CLIENT_ID"\), … defineSecret\("EBAY_CALLBACK_KEY"\)\]\s*:\s*\[\];/.test(index));
```

Adding a sixth **fails this test**, by design — the test exists so that the mounted set cannot change
without someone noticing. Updating it is part of the change, not a workaround: extend the regex with
the sixth, and update the check name at `:15` and the comment at `:24`, both of which say "five".

`npm test` stops at the first failure (per the emulator-suite note in memory), so run the qa suite
and read `commerce-ebay-wiring.test.js` green explicitly — a green run that stopped earlier proves
nothing.

### 4.4 Which functions must list it: all seventeen, and why narrowing is not worth it here

Only `ebayNotifications` *reads* it, so mounting it on all seventeen puts the plaintext in the
environment of sixteen processes that have no use for it — including `revealRestrictedCustomer`, an
internet-facing callable that hands out buyer addresses.

I am recommending the uniform list anyway, for two reasons taken straight from the SA proposal §4.2:

1. **IAM is byte-identical either way.** `firebase-tools` grants `secretAccessor` per secret to each
   endpoint's service account, and all seventeen share one SA. Narrowing the list would not remove
   one binding.
2. **Narrowing is a structural change, not a one-liner.** `ebayNotifications` receives its options
   through the injected wrapper `onRequest: (options, handler) => onRequest({ ...options,
   ...EBAY_RUNTIME }, handler)` (`index.js:6186`). `EBAY_RUNTIME.secrets` clobbers any `secrets` the
   inner call passes, so a per-function extra secret means changing the wrapper to merge, and having
   `ebayConnector.js` name a secret — which would break the factory's dependency-injection purity
   (it currently knows nothing about `firebase-functions/params`).

The SA proposal already records runtime blast-radius narrowing as a real and cheap tightening, and
already scopes it out as a separate code change. **This migration should not be the thing that
smuggles it in.** Recorded here so it is not lost a second time: if that tightening is ever done, the
deletion token is the clearest candidate — one reader, one path.

---

## 5. Creating the secret without printing the value

Two forms. Both keep the value off every shared surface. The assistant runs neither.

**Form A — generated and stored in one pipeline, never materialised (the TRACK17 pattern):**

```bash
openssl rand -hex 32 | tr -d '\n' | \
  gcloud secrets create NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN \
    --data-file=- --replication-policy=user-managed --locations=europe-west2 \
    --project eggcraft-studio
```

64 hex characters: inside eBay's `{32,80}` and inside `[A-Za-z0-9_-]`.

Form A requires reading the value back **once** to paste into the eBay portal:

```bash
gcloud secrets versions access latest --secret=NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN \
  --project eggcraft-studio
```

**Form B — generated once into a shell variable, used twice, never printed (preferred):**

```bash
TOKEN=$(openssl rand -hex 32)
printf '%s' "$TOKEN" | gcloud secrets create NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN \
  --data-file=- --replication-policy=user-managed --locations=europe-west2 \
  --project eggcraft-studio
# paste into the eBay portal from the same variable, then:
unset TOKEN
```

Form B avoids `versions access` entirely, so the value never reaches the terminal at all. The
operator does the portal paste; **the assistant does not enter credentials into third-party forms.**

> **Replication policy — the two eBay docs disagree, and this document does not resolve it.**
> `docs/ebay-runtime-service-account-proposal.md:822` creates the five with
> `--replication-policy=user-managed --locations="$REGION"`;
> `docs/ebay-functions-deploy-plan.md:56` uses `--replication-policy=automatic`. For a UK/EU project
> that is a data-location decision, not cosmetics. **Whatever the five actually get, this sixth must
> match.** Since none of the five exists yet, the operator sets the precedent on the same day and
> should use one loop for all six.

**Never `printf '%s' "$TOKEN"` to stdout, never `echo` it, never put it in `functions/.env`.** The
plain-env form is the exact exposure the TRACK17 incident was about: an unfiltered
`gcloud run services describe` printed every environment entry with its value into a transcript.

---

## 6. The IAM grant, at resource scope

One binding, on that secret as a resource, to the connector identity and nobody else:

```bash
gcloud secrets add-iam-policy-binding NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN \
  --project=eggcraft-studio \
  --member="serviceAccount:ebay-connector@eggcraft-studio.iam.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor --quiet
```

Identical in shape to SA proposal Step 5, which grants the same role on each of the five as a
resource. In practice this is **one more iteration of the same `for` loop** — add the name to the
list rather than running a separate command:

```bash
for S in EBAY_CLIENT_ID EBAY_CLIENT_SECRET EBAY_TOKEN_KEY EBAY_HASH_KEY EBAY_CALLBACK_KEY \
         NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN; do …
```

Granularity is per secret, not per version, so a later version is readable under the same binding —
which is what makes rotation possible at all, and also what makes the §7 mismatch hazard real.

`roles/secretmanager.secretAccessor` is **not** granted at project level anywhere in this project
(SA proposal §3.7), so without this binding the value is unreadable no matter what is declared.

### The design regression this creates, stated plainly

`docs/ebay-connector-design.md:121`, `:3192` and `:3717` all assert that **the challenge GET needs no
secrets**. After this migration that sentence is false: the challenge GET depends on the marker file,
the secret having a version, and this binding.

The *failure mode* does not change — an unreadable token answers 503, exactly as an unset variable
does today. What changes is the **number of things that can cause it**, from one to three. Add a row
to the SA proposal's §3.7 failure table:

| Missing | Symptom |
|---|---|
| `secretAccessor` on `NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN` | challenge GET answers **503**; eBay cannot validate or re-validate the destination. **Deletion POSTs are unaffected** — they are gated by `EBAY_CLIENT_ID`, not by this. Quiet: no error appears in normal traffic. |

And correct those three design-doc sentences in the same commit, so the next reader is not misled into
registering the destination before the marker exists.

---

## 7. The ordering problem

Three parties must hold or mount the same value, and only two of them are ours:

| | Holder | How it gets the value |
|---|---|---|
| A | **Secret Manager** | we create it |
| B | **the running `ebayNotifications` revision** | a deploy mounts A |
| C | **the eBay Developer Portal** | the operator pastes it |

eBay fires the challenge GET when C is saved. The endpoint answers correctly only if B is live and B
equals C. So the order is forced:

> **A → B → prove B ourselves → C.**
> Create the secret and grant it, deploy so it is mounted, verify the endpoint answers a hash *we*
> can predict, and only then register in the portal.

### Step "prove B ourselves" is the one that must not be skipped

Because the response is a hash and not an echo (§1), a wrong token still returns a well-formed 200.
We cannot tell by looking. But we *can* compute the expected value ourselves and compare, without
involving eBay:

```bash
CODE=$(openssl rand -hex 8)
curl -s "https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayNotifications?challenge_code=$CODE"
# compare against, computed locally from the same value that went into Secret Manager:
#   sha256hex( CODE + TOKEN + "https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayNotifications" )
```

A 503 here means the marker, the secret version, or the binding is missing — fix it before touching
the portal. A 200 whose hash does not match means A and B have diverged. Either way, eBay never sees
a failure and the destination is never half-registered.

**Verified live, 10 September 2026 12:56:35Z** (`ebay-relay-key-and-deletion-token-2026-09-10.md` §1): the endpoint
answered HTTP 200 and its `challengeResponse` equalled the digest computed locally from the Secret Manager value.

### What breaks if the order is wrong

| Wrong order | What happens | Severity |
|---|---|---|
| **C before B** (portal registered before the deploy) | challenge GET answers 503; eBay refuses to save the destination | **Safe.** Loud, immediate, retryable. Nothing is left in a bad state. |
| **B before A** (deploy declares a secret with no version) | the deploy fails outright. The repo's own note at `index.js:155-157` records that *"The CLI refuses ANY deploy while a declared secret has no value in Secret Manager"* — the reason the Xero secrets are declared behind a marker | **Safe**, and contained: the eBay deploy is seventeen names, never `--only functions`, so nothing else is blocked. **[NEEDS LIVE VERIFICATION]** of `firebase-tools`' exact behaviour on this version; asserted here on the repo's own recorded experience, not on an independent check. |
| **A rotated after C** (secret gets a new version; portal not updated) | **nothing visibly breaks.** Deletion POSTs keep arriving, verifying and processing — they never read this token (§3). The endpoint now answers a hash eBay does not expect, and this is discovered only when eBay next validates the destination | **The dangerous one.** Silent. If validation then fails, eBay can mark the callback URL down — `docs/ebay-connector-design.md:87` quotes *"After a 24-hour period of multiple, unacknowledged notifications … the callback URL is marked down … up to 30 days to resolve"* — and a marked-down deletion endpoint is a compliance failure, not a feature outage. |

**The rule that follows, and it is the whole point of this document:** after registration, Secret
Manager and the eBay portal are **one atomic pair**. Never add a version to this secret without
updating the portal in the same sitting, and never treat "the connector still works" as evidence
that a rotation succeeded. That evidence does not exist on this path.

This is the TRACK17 lesson inverted. There, the operator step (reconfiguring 17TRACK) was the *last*
link and its absence announced itself in 401s. Here the operator step is the last link and its
absence announces nothing.

---

## 8. Rollback

**Before the portal registration (C), rollback is total and free:**

1. Revert the `EBAY_SECRET_PARAMS` line and the `commerce-ebay-wiring.test.js` edits.
2. Redeploy the seventeen — or don't, if they were never deployed.
3. Optionally `gcloud secrets delete NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN --project eggcraft-studio`.

Nothing outside the project has ever seen the value, no destination is registered, and eBay is not
aware the endpoint exists. There is no external state to unwind.

**After the portal registration, rollback is forward-only. Say so out loud.**

- Reverting the code means the token must live as a plain value again, which means `functions/.env`,
  which is precisely the exposure class the TRACK17 incident was about. **That is not a rollback, it
  is a regression.** Do not do it.
- The deploy-level rollback in `docs/ebay-functions-deploy-plan.md` is *deletion, not revert* — none
  of the seventeen has a previous revision to return to. Deleting `ebayNotifications` leaves eBay's
  registered destination pointing at a dead URL: deletion notifications go unacknowledged and the
  24-hour / 30-day markdown clock quoted above starts running. **If the seventeen are ever rolled
  back after the destination is registered, un-registering the destination in the portal is part of
  the rollback**, and it is an operator step that no `gcloud` command performs.

The genuine recovery for a bad token after registration is to fix forward: add a new version, update
the portal, re-verify with the §7 probe. Both halves, same sitting.

---

## 9. Before or after the seventeen-function deploy?

**Before — folded into that same deploy, not chased afterwards.** Three reasons, in order of weight:

1. **It removes a rotation from the plan.** `docs/ebay-connector-design.md:3716` (§15 step 4) has the
   operator register the destination *immediately after* the deploy. If the token is still a plain
   env var at that moment, the operator registers value X, and migrating later means introducing a
   value Y and updating the portal — a rotation, carrying exactly the silent-mismatch hazard of §7.
   Migrating first makes registration a single, one-value, one-time event. **This is the reason; the
   other two are bonuses.**
2. **It is nearly free right now and expensive later.** Today it is one name in an existing `for`
   loop, one array entry, one test regex. Later it is a second production deploy of a public
   compliance endpoint plus a two-party rotation.
3. **The five secrets do not exist yet either.** SA proposal Step 5 has not been run. There is no
   "already done" state to disturb — the sixth joins the five before any of them is created.

The argument against, stated fairly: it makes the challenge GET depend on the marker, the secret and
the binding, where the design document promised it would depend on none of them (§6). I judge that
worth paying, because the failure mode is unchanged (503 either way) and the alternative is a
guaranteed future rotation of a value whose mismatch is invisible. But it is a real trade and the
operator should make it knowingly rather than find the design doc contradicted later.

### Where it lands in the existing sequence

| Step | Existing plan | Change |
|---|---|---|
| SA proposal Step 5 | create five secrets, grant `secretAccessor` on each | **six** secrets, six bindings — same loop |
| Deploy plan Step 1 | operator supplies the five values | **plus** this one, generated by Form A or B (§5) |
| — | commit `.ebay-secrets-ready` (operator's, not committed by the connector work — `wiring.test.js:27`) | unchanged |
| Deploy plan Step 2 | deploy the seventeen by name | unchanged; the sixth mounts with the others |
| **new** | — | **run the §7 self-probe: challenge GET returns 200 and the hash matches** |
| Design §15 step 4 | register the destination + verification token in the portal; subscribe `MARKETPLACE_ACCOUNT_DELETION`; *Send Test Notification*; confirm a ledger row `done` | unchanged, and now provably safe to attempt |

---

## 10. What I could not establish

| Claim | Why not | Command or source that would settle it |
|---|---|---|
| The secret does not already exist in Secret Manager | `gcloud` credentials expired | `gcloud secrets describe NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN --project eggcraft-studio` (expect `NOT_FOUND`) |
| No IAM binding exists for it | same | `gcloud secrets get-iam-policy NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN --project eggcraft-studio` |
| The variable is not set on a *deployed* function | same; and no eBay function is deployed, per the deploy plan's verified listing | `gcloud run services describe ebaynotifications --region europe-west2 --format='value(spec.template.spec.containers[0].env[].name)'` — **names only; never an unfiltered `describe`, which is how the TRACK17 value leaked** |
| `firebase-tools` refuses a deploy when a declared secret has no version | no live deploy possible | asserted from the repo's own note at `index.js:155-156`; confirm on a throwaway secret before relying on it |
| Whether eBay re-challenges an already-registered destination | a question about eBay, not about us | eBay Developer Portal — Notification API / Marketplace Account Deletion pages |
| That the main checkout's `functions/.env` is the same file used for the eBay deploy | I read key names only, in a different worktree | operator confirms which `.env` the deploying machine holds |

### One thing found in passing, out of scope, worth not losing

This branch predates the TRACK17 Secret Manager migration. Main has
`defineSecret("TRACK17_WEBHOOK_TOKEN")` at `functions/index.js:94` and the `token_in_url` refusal at
`:21675`; **this branch has neither** — its `track17Webhook` at `functions/index.js:21825` still
reads `process.env.TRACK17_WEBHOOK_TOKEN` (`:21845`). That is a merge concern for whoever lands
`ebay-connector`, not a defect in it, and **not** something to fix inside this migration. Flagging it
because a naive merge could reintroduce the pre-migration handler.
