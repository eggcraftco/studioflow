# eBay connector — what needs your approval, and the design behind it

Written 6 September 2026, after the build and both review passes. **Nothing in the eBay developer
portal has been touched.** No RuName, no redirect registration, no notification destination, no
secret, no production connection. Everything below is code and documentation on the `ebay-connector`
branch, waiting on you.

## 1. Where the work stands

| Piece | State |
|---|---|
| Design (`docs/ebay-connector-design.md`) | Revised after two adversarial reviews; all fourteen of your required items resolved and mapped one by one in `docs/ebay-design-review-map.md` |
| Server half | OAuth, sync, notifications, the account-deletion endpoint, quota, rules, tests |
| Web card, Mac and iPhone card, Android card | All four shipped on the branch, with the eBay screen translated into eleven languages |
| Review | Two adversarial reviewers raised sixteen findings, four of them high; all fixed on the branch |
| Verification | Unit suite 1,277 passing and 0 failing, exit 0, re-run independently after the reviews. The emulator chain (rules plus twenty-two end-to-end suites) exits 0. Web typechecks and builds. Mac and Android compile |
| Credential hygiene | The whole branch diff was scanned: no Cert ID, no client secret, no token, no base64 blob. The secrets marker file is not committed |
| Live effect if deployed today | None. The connector is behind a switch that is off, and the secrets marker does not exist, so the functions deploy with no eBay identity and no eBay secret |

## 2. The four URLs

| Purpose | Value |
|---|---|
| Authorize, sandbox | `https://auth.sandbox.ebay.com/oauth2/authorize` |
| Authorize, production | `https://auth.ebay.com/oauth2/authorize` |
| **Auth accepted URL**, on the RuName | `https://nivadesk.app/ebay/callback` |
| **Auth declined URL**, on the RuName | `https://nivadesk.app/settings?section=ebay&ebay=cancelled` |
| Notification destination | `https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayNotifications` |

The accepted URL is a page on our own site rather than the Cloud Function, and the seller's browser
**stops there**. That page adds one thing eBay never sees — a nonce from a cookie — and then hands the
code, the state and that nonce to the Cloud Function in a **signed server-to-server POST**, never in a
URL (design §5.4). The nonce is what binds the OAuth state to the browser that started it, so a stolen
state parameter cannot finish someone else's connection. Why it travels in a body rather than a query
string — and what that does and does not fix — is Gate C below and
`docs/ebay-callback-platform-logging.md`.

The declined URL returns the seller to the eBay settings section with a plain sentence. A decline that
arrives the other way, as an `error` parameter on the accepted URL, is settled by that same page and
reads the same; the Cloud Function is not called at all and no longer has a decline branch.

The deletion endpoint is the Cloud Function itself, with no forwarder on `nivadesk.app`. eBay hashes
the URL you register into its challenge answer, so a forwarder would make the hashed URL and the
receiving URL drift apart.

## 3. Sandbox and production are separate keysets, one value at a time

eBay issues a RuName per keyset, so sandbox and production have different RuNames and different app
keys. The server holds one environment and one RuName at a time. Every stored connection records the
environment it was made in: a callback whose state disagrees is refused, and the sweep skips rows
from the other environment rather than refreshing them with the wrong keyset. At the flip you set the
two values and a one-off purge removes the sandbox rows. The same two URLs are registered on both
keysets.

## 4. Three gates, all closed

**Gate A, RuName registration.** Register the accepted and declined URLs above on the sandbox keyset.
eBay returns a RuName string, which is not a secret and can be recorded.

**Gate B, secret wiring — five secrets now, and one of them lives in two places.** The App ID and
Cert ID from the keyset, plus three 32-byte keys you generate: one for boxing tokens, one for hashing
buyer identifiers, and — new since design §5.4 — one shared key that the web callback page signs with
and the Cloud Function verifies. The Cert ID never appears in a chat message, a log, a document or the
repository. You enter all five directly in Secret Manager, granted to a dedicated service account that
can read those five and nothing else.

The fifth has a twin outside Google. The same value goes into the Hostinger environment for
`nivadesk.app` as `NIVADESK_EBAY_CALLBACK_KEY`, with no `NEXT_PUBLIC_` prefix — that prefix would
compile the value into every visitor's browser. Both halves are needed and neither is dangerous alone:
if only Hostinger has it the function answers 401; if only Secret Manager has it the web page never
calls; if the two values differ the signature fails. Every one of those is the same harmless failure —
the seller sees "eBay did not complete the connection. Try again.", no state is consumed, no token is
exchanged, nothing is written. `docs/ebay-web-callback-deploy-plan.md` §4 has the exact matrix, the two
names and the order you set them in.

Nothing is mounted until `functions/.ebay-secrets-ready` is committed naming all five and the functions
are deployed. Until that moment the callback answers 401 to everything — which is what "deploying this
code activates nothing" means in practice, not a promise about a switch.

**Gate C, notification destination and the first real connection.** The deletion endpoint plus a
verification token, registered after the secrets are live, because the challenge is answered without
a secret but the deletion request needs one. Two things must also be true before the first sandbox
seller, because that is the first moment a genuine authorization code and a genuine nonce exist: the
web deploy carrying the §5.4 callback must be live (the version on the site today still redirects the
browser onward to the Cloud Function with those values in the URL), and the one-off proof that
Hostinger hands the shared key to the running server rather than only to the build must have been done
— deploy plan §4.3 step 4. Then the first sandbox seller.

**Production is not simply "after sandbox acceptance" any more; it is blocked, and by something
outside this code.** eBay delivers the authorization code to the accepted URL in a query string, and
Hostinger's access log keeps that request line verbatim — measured on 6 September with synthetic
values, with no panel setting to disable or redact it, and with retention, readers and onward copies
all undisclosed in Hostinger's own answers. The decision recorded in
`docs/ebay-callback-platform-logging.md` is: the sandbox residual is accepted on the record (a sandbox
code belongs to a test seller and is worthless without the Cert ID), and the **production** RuName is
not created until the callback is served by a Cloudflare Worker on `connect.nivadesk.app` and synthetic
values prove no query string is retained there. Creating the production RuName earlier would point it
at the very hop being avoided.

## 5. What the reviews found and fixed

Sixteen findings, four of them high. The four that mattered most:

- **A failed account deletion was swallowed for ever.** The ledger deduplicated on receipt rather
  than on completion, so any retry of the same notification got a cheerful 200 whatever the stored
  row said, and nothing ever read the ledger back. eBay's redelivery is the only safety net behind
  the endpoint it makes mandatory. Now a row is answered as a duplicate only when it is genuinely
  done, a stuck row is re-driven under a lease, and a new ungated ten-minute reconciliation reads the
  ledger back and retries with a growing backoff.
- **Held eBay orders could never be released in production**, because the release path could not
  decrypt eBay credentials.
- **The personal-data trip-wire misfired on ordinary product data**: five-digit part numbers looked
  like postcodes, which redacted titles and could refuse whole orders.
- **A buyer with no address was invisible to account deletion** even though their handle survived in
  four places.

## 6. What is deliberately not done

- The reveal button that shows a buyer's address exists on the web only. Mac, iPhone and Android
  cannot yet ship an eBay order without the web.
- Android was compiled and unit-tested, not exercised on a device.
- The seller's fee is not imported. eBay reports it in the finances feed, which this release does not
  read, and inventing a zero would lie to the finance engine. The connector card was corrected to
  promise only orders, payments and refunds.
- After the first deploy the connector's service account needs permission to enqueue on its own task
  queue. The queue itself is created by the deploy.
