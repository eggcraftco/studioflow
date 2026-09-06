# The production callback on connect.nivadesk.app

Design only. Nothing has been created: no DNS record, no Worker, no route, no secret, and no
production RuName. 6 September 2026.

## Why this exists

Hostinger answered all five questions and the answers were: no path-level or site-level way to
disable or redact access logging, no stated backend retention, no disclosure of who can read the
logs, no confirmation or denial that they are copied to other systems, and no masking option
anywhere. Their own words: treat the authorization code as exposed for an undocumented period to an
undocumented set of systems. Under the operator's rule that is a production blocker, so production
traffic stops going through Hostinger for this one path.

## Shape

**Both halves of the OAuth flow live on the connect host.** Start and callback are the same origin,
so the binding cookie can be host-only and is never offered to `nivadesk.app` or to any other
subdomain.

```
settings page on nivadesk.app  ── beginEbayConnect (authenticated callable) ──▶ state
        │  302, carrying the state only — never a nonce
        ▼
connect.nivadesk.app/ebay/start   (Worker)
        │  server-to-server POST: "mint the binding value for this state"
        │  backend mints it, stores only its hash, answers with the value + authorize URL
        │  Worker sets its OWN cookie: host-only, Secure, HttpOnly, SameSite=Lax, short-lived
        ▼
   eBay consent  ──GET──▶  connect.nivadesk.app/ebay/callback   (same Worker)
        │  reads code and state from the query, binding value from its own cookie
        │  refuses anything that is not a callback
        ▼
   POST (JSON body, shared-secret header)
        ▼
   europe-west2-…/ebayOAuthCallback   (POST only, logs no body value)
        │  JSON answer { ebay, reason }
        ▼
   302 → https://nivadesk.app/settings?section=ebay&ebay=…
```

The seller starts and finishes on nivadesk.app; only the consent hop runs on the connect host. The
OAuth code therefore never reaches Hostinger at all.

## What the Worker does, in order

1. **Method and shape.** Anything but GET → 405. A URL longer than a sane bound, or a `state` or
   `code` outside `[A-Za-z0-9_.\-]{1,512}`, is malformed → refuse, no backend call.
2. **Not a callback.** No `code` and no `error` → 302 to the settings page with `reason=missing_code`.
   Same edge refusal the Hostinger route already ships.
3. **Decline.** `error` present → 302 to the settings page with `ebay=cancelled`. **The backend is
   never called**, so a decline costs nothing and reaches no connector.
4. **Browser binding.** No nonce cookie → 302 with `reason=browser`. The backend is never called, so
   a phished consent dies at the edge.
5. **Replay.** The state is single-use and burned inside the backend's transaction, which stays the
   authority. The Worker adds a cheap first line: a Cloudflare KV entry keyed by a hash of the state,
   written before the POST with a ten-minute TTL; a second arrival for the same state is refused with
   `reason=state` without calling the backend. KV is a guard, never the source of truth.
6. **The call.** `POST` with a JSON body carrying `code`, `state` and `nonce`, and the shared secret
   in a header. Timeout bounded; a timeout or a non-JSON answer lands the seller on the settings page
   with a sentence, never a stack trace.
7. **The answer.** The Worker turns the backend's `{ ebay, reason }` into the 302 the seller sees.
   Reason words stay exactly as they are today; a technical code never reaches the screen.

## What the Worker must never do

- **Never log a query value.** No `console.log(request.url)`, and no logging of `code`, `state`, the
  binding value, any cookie, or any part of the POST body — on any path, including error handlers and
  the `catch` of last resort. The only thing the Worker may record is a reason word and a counter.
- **Configure the platform to redact as well, not instead.** In `wrangler.toml`:

  ```toml
  [observability.logs]
  invocation_logs = false        # no automatic per-request log line for this Worker
  ```

  and, wherever the account exposes it, `redact_query_string = true` so that any log line Cloudflare
  does write for this Worker carries a stripped URL. Both are belt and braces: the code must be
  correct even if a setting is later flipped, and the setting must hold even if a future code change
  is careless.
- **Never put the secret anywhere but the secret store.** `wrangler secret put` only; never in
  `wrangler.toml`, never in the repository, never in an error message, never echoed to a log line.
- **Never redirect to a host from the request.** Both redirect targets are module constants.

## The binding cookie: host-only, and deliberately not widened

The obvious move is to widen today's cookie to `Domain=.nivadesk.app` so the connect host receives
it. **That is rejected.** A domain-wide cookie is offered to every NivaDesk subdomain, present and
future, which trades a logging problem for a broader one.

Instead the Worker mints and owns its own cookie on its own host:

| Attribute | Value | Why |
|---|---|---|
| Domain | **host-only** (no `Domain` attribute) | It exists on `connect.nivadesk.app` and nowhere else |
| Path | the callback path | Not sent on any other request to the same host |
| `Secure` | yes | Never leaves over plaintext |
| `HttpOnly` | **yes** | Today's cookie is written with `document.cookie` and is therefore readable by script; on the connect host nothing but the Worker needs it, so script access is removed |
| `SameSite` | `Lax` | Survives eBay's top-level redirect back, refuses cross-site sub-requests |
| Lifetime | minutes, and cleared on the callbacks that **consumed** it | Single use in practice as well as in intent. Not on every callback: clearing on a landing that consumed nothing lets any link the seller opens destroy an in-flight connect, which is the defect fixed in today's route (`ebay-connector-design.md` §5.4) and must not be reintroduced here |

**Who mints the value.** The backend stays the authority: it mints the value, stores only its
`sha256`, and hands the value to the Worker over the server-to-server call at start. The Worker's job
is to put it in a cookie and to hand it back in the callback body. One authority, one hash, no new
crypto.

**The residual this creates, stated rather than hidden.** Today `/ebay/start` runs on nivadesk.app
where a Firebase session exists, so `claimEbayConnectState` can insist the caller is the same signed-in
uid that began the flow. `connect.nivadesk.app` is a different origin and has no Firebase session, so
that check cannot happen there. What replaces it: the state is single-use, short-lived, minted only
for an authenticated owner, and **the backend mints a binding value for a state exactly once** — the
legitimate browser mints first, and anyone arriving afterwards with a copied state is refused. That is
weaker than a uid check and it is a deliberate trade for keeping the code off Hostinger. The operator
should decide it knowingly; it is not equivalent.

## The proof that has to come before anything is created

The operator's condition is explicit: **do not write "production logging risk resolved" and do not
create the production RuName** until synthetic values prove Cloudflare keeps nothing. The measurement
mirrors the Hostinger one: send `code=SYNTH…&state=SYNTH…` to the Worker path, then look for those
strings in every place Cloudflare could keep them.

| Surface | What to check | Expected |
|---|---|---|
| Workers Logs / `wrangler tail` | Search the invocation log for the synthetic values. Note that Workers Logs records the request URL by default, so this is the one most likely to fail — if it does, either disable the observability setting for this Worker or accept that Cloudflare holds it and say so | no match, or the setting turned off and re-measured |
| Workers Analytics Engine | Only if the Worker writes to it; it must not | not used |
| Cloudflare HTTP analytics | Whether any dimension carries a full URI with query | no query values |
| Security Events / WAF | A blocked or challenged request stores its URI; check whether any rule fires on this path | no match, or the path excluded |
| Traces | Whether Workers traces carry the request URL for this Worker | no match |
| Logpush / edge log jobs | **List every job on the account.** `ClientRequestURI` is to be assumed to contain the query string. Any job that collects it and covers this hostname must have the field removed, or the hostname excluded, or the job must not cover this path at all | no job ships a URI for this host |
| Downstream destinations | Where any surviving job delivers (bucket, SIEM, third party), because a redacted Cloudflare view means nothing if a copy left the platform | enumerated, and none carries this path |
| Cloudflare account plan | Which of the above are even available on this plan | recorded, so the answer is reproducible |

Only when every row is answered with evidence does the note change, and only then is the production
RuName created with `https://connect.nivadesk.app/ebay/callback` as its accepted URL.

## Order of operations, when the operator approves

1. Add `connect.nivadesk.app` as a proxied record and bind the Worker to it (operator).
2. Deploy the Worker with `invocation_logs = false` and query-string redaction on, no secret
   configured, and confirm it fails closed rather than open.
3. `wrangler secret put` the shared secret (operator types the value; it never appears in the
   repository, in `wrangler.toml`, in the dashboard as plaintext, or in a log line).
4. Move the start half: the settings page redirects to `connect.nivadesk.app/ebay/start` with the
   state only, and the Worker mints the host-only cookie. Prove the binding still refuses a browser
   without the cookie.
5. Run the synthetic measurement across all seven surfaces and record every row with its evidence.
6. Only if every row is clean: create the production RuName with
   `https://connect.nivadesk.app/ebay/callback` as the accepted URL, and record it.
7. The declined URL can stay on nivadesk.app: a decline carries no code, so it is not part of this
   problem.

## What this does not change

Sandbox keeps its current accepted URL on nivadesk.app while the sandbox residual is accepted
temporarily. The Cloud Function's POST-only contract is the same for both hosts, so the Worker and the
Hostinger route are interchangeable callers and no backend change is needed to switch.
