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

```
eBay  ──GET──▶  connect.nivadesk.app/ebay/callback   (Cloudflare Worker, proxied)
                        │  reads code, state, and the nonce cookie
                        │  refuses anything that is not a callback
                        ▼
                 POST (JSON body, shared-secret header)
                        │
                        ▼
        europe-west2-…/ebayOAuthCallback   (POST only, logs no body value)
                        │  JSON answer { ebay, reason }
                        ▼
        302 → https://nivadesk.app/settings?section=ebay&ebay=…
```

The seller sees a nivadesk.app address at the start and at the end. The middle hop is a subdomain of
the same site, which is what keeps the OAuth code off Hostinger entirely.

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

- **Never log a query value.** No `console.log(request.url)`, no logging of `code`, `state` or
  `nonce`, on any path including error handlers. The only thing the Worker may record is a reason
  word and a counter.
- **Never put the secret anywhere but the secret store.** `wrangler secret put` only; never in
  `wrangler.toml`, never in the repository, never in an error message, never echoed to a log line.
- **Never redirect to a host from the request.** Both redirect targets are module constants.

## The cookie question, which is easy to get wrong

Today the nonce cookie is written for `nivadesk.app` with `Path=/ebay/callback`. A cookie with that
path is **not** sent to `connect.nivadesk.app`. Before the Worker can check the binding, the connect
flow must write the cookie so that the callback host receives it: `Domain=.nivadesk.app` with the
path the Worker serves, `Secure`, `SameSite=Lax`, short life, cleared on every callback. This is a
one-line change on the web side and a line in the design, and it must land in the same change as the
Worker or step 4 silently never fires.

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
| Logpush / edge log jobs | List the account's jobs; a job with `ClientRequestURI` would ship the query string off-platform | no job covering this hostname, or the field excluded |
| Cloudflare account plan | Which of the above are even available on this plan | recorded, so the answer is reproducible |

Only when every row is answered with evidence does the note change, and only then is the production
RuName created with `https://connect.nivadesk.app/ebay/callback` as its accepted URL.

## Order of operations, when the operator approves

1. Add `connect.nivadesk.app` as a proxied record and bind the Worker to it (operator).
2. Deploy the Worker with no secret configured and confirm it fails closed rather than open.
3. `wrangler secret put` the shared secret (operator types the value).
4. Run the synthetic measurement above and record every row.
5. Only if every row is clean: create the production RuName with the new accepted URL, and record it.
6. The declined URL can stay on nivadesk.app: a decline carries no code, so it is not part of this
   problem.

## What this does not change

Sandbox keeps its current accepted URL on nivadesk.app while the sandbox residual is accepted
temporarily. The Cloud Function's POST-only contract is the same for both hosts, so the Worker and the
Hostinger route are interchangeable callers and no backend change is needed to switch.
