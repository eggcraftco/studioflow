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

The accepted URL is a page on our own site rather than the Cloud Function. That page adds one thing
eBay never sees, a nonce from a cookie, and forwards every eBay parameter untouched. That is what
binds the OAuth state to the browser that started it, so a stolen state parameter cannot finish
someone else's connection.

The declined URL returns the seller to the eBay settings section with a plain sentence. The callback
function maps an `error` parameter to the same place, so a decline arriving the other way reads the
same.

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

**Gate B, secret wiring.** Four secrets: the App ID and Cert ID from the keyset, plus two 32-byte
keys we generate, one for boxing tokens and one for hashing buyer identifiers. The Cert ID never
appears in a chat message, a log, a document or the repository. You enter it directly in Secret
Manager. The code reads it at runtime under a dedicated service account that can read those four
secrets and nothing else.

**Gate C, notification destination and the first real connection.** The deletion endpoint plus a
verification token, registered after the secrets are live, because the challenge is answered without
a secret but the deletion request needs one. Then the first sandbox seller, and only after sandbox
acceptance, the production keyset.

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
