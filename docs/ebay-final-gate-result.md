# The final gate on the eBay callback — result

**Verdict: PASS.** All seven criteria in `docs/ebay-callback-acceptance-criteria.md` hold, and each is
held by a test that fails when the guard behind it is removed. Nothing blocking was found.

Judged against that file, not against a memory of a chat. Run on branch `ebay-connector` at
`4e74929f`, in `/Users/gocmen/Developer/studioflow-ebay`, on 6 September 2026.

**Round 167 and the first sandbox OAuth are unblocked.** They were conditional on this gate passing,
and it passes. Two things this verdict does not do: it does not push, deploy or enable anything, and
it does not certify the native builds — see *What this gate did not check* below.

---

## The gate is still shut

Nothing here turned the connector on. Verified after the last suite:

- `functions/.ebay-secrets-ready` — **absent** (`ls` exits 1, no such file).
- `functions/index.js:146` — `const EBAY_CONNECTOR_ENABLED = String(process.env.NIVADESK_EBAY_CONNECTOR || "") === "1";`
  So the connector is off unless the variable is explicitly `1`. Default off.
- `git status --porcelain` — empty, before the first suite and after the last.

No OAuth flow was started, eBay was not contacted, and no secret was read or printed.

---

## The commands, their exit codes and their counts

| # | Command | Working directory | Exit | Count |
|---|---|---|---|---|
| 1 | `npm test` | `functions/` | **0** | 1,310 PASS / 0 FAIL |
| 2 | `npm run test:relay` | `studioflow-web/` | **0** | 135 PASS / 0 FAIL |
| 3 | `npm run test:ebay-regressions` | `studioflow-web/` | **0** | `01✓ 02✓ 03✓ 04✓ 05✓ 06✓ 07✓ 08✓ 09✓ 10✓` |
| 4 | `npm run typecheck` | `studioflow-web/` | **0** | `tsc --noEmit`, no diagnostics |
| 5 | `npx next build --no-lint` | `studioflow-web/` | **0** | compiled in 1837 ms; `ƒ /ebay/callback`, `ƒ /ebay/start`, `ƒ /ebay/ticket` |
| 6 | `firebase emulators:exec --only firestore,storage 'npm run test:rules && bash test/run-e2e.sh'` | `functions/` | **0** | 312 PASS / 0 FAIL |

The functions total is the brief's number exactly: 1,310.

**Ports first.** `lsof -nP -iTCP:8080 -sTCP:LISTEN` and the same for `9199` both returned nothing
(exit 1) immediately before each emulator run, so neither emulator collided with another session.
`JAVA_HOME` was the Android Studio jbr:
`/Applications/Android Studio.app/Contents/jbr/Contents/Home`.

**One correction worth recording for the next runner.** The emulator chain was first invoked from the
repository root and died at exit **254** — `npm error enoent … open
'/Users/gocmen/Developer/studioflow-ebay/package.json'`. That is an invocation error, not a red suite:
there is no `package.json` at the root. Both halves of the chain live in `functions/`
(`functions/package.json:21` defines `test:rules`; `functions/test/run-e2e.sh` is the e2e script), so
the chain must be run with `functions/` as the working directory. Re-run there, it exits 0.

**What the emulator tier covered, specifically.** Nineteen suites, including `EBAY CONNECTOR E2E
GEÇTİ` and `EBAY ACCOUNT DELETION E2E GEÇTİ`, and the rules cases that close the presented-code
registry to every client — `the workspace owner cannot read/write/update/delete
ebayPresentedCodes/…`, and the same four again for a member holding the reveal grant.

---

## The seven criteria, and the test that proves each

Each row names the test the criteria file names. The final column is the mutation I ran to prove the
test is not vacuous: the guard was deleted or inverted in the working tree, the named test re-run, and
the file restored with `git checkout --`. **I did not take any test's word for a criterion.** The tree
was verified clean before and after every mutation.

### 1 — The browser nonce appears in no URL anywhere

*Held by:* the nonce lives in a callable reply, a cookie and a signed POST body; the function refuses
any query string outright.

*Proven by:* relay vector "the route puts no value in a URL"; `ebay-connect`'s query-string → 400 case
and the SOURCE PIN's `req.query` assertion.

*Non-vacuous:* changing `studioflow-web/app/ebay/callback/route.ts:211` to
``fetch(`${CALLBACK}?ts=…`)`` fails the relay vector. Neutering `functions/ebayConnector.js:733` fails
both the 400 case and the SOURCE PIN. Inserting `const q = req.query` at
`functions/ebayConnector.js:735` fails the SOURCE PIN on its own `req.query` assertion.

### 2 — The browser/session binding is verified in the web layer

*Held by:* `lib/studioflow/ebayTicket.ts` verifies shape, MAC, window, the state match and the nonce
tag **before** anything is signed.

*Proven by:* `EBAY-REG-01/02/03/04/06/07` in `studioflow-web/scripts/check-ebay-callback-regressions.mjs`,
plus the relay vectors `ticket-other-state` and `ticket-other-nonce`. (The criteria file cites these as
"relay cases 1, 2, 3, 4, 6, 7"; the cases exist and are guard-sensitive, but they are `EBAY-REG-*` cases
under `test:ebay-regressions`, not numbered relay cases — see backlog item L8.)

*Non-vacuous:* four separate mutations, one per guard — `ebayTicket.ts:75` (MAC) fails EBAY-REG-01;
`:79` (window) fails EBAY-REG-04; `:97` (state) fails EBAY-REG-02 and relay `ticket-other-state`; `:99`
(nonce tag) fails EBAY-REG-03 and relay `ticket-other-nonce`.

### 3 — Code and state reach the backend only in a server-to-server POST body

*Held by:* one module constant (`CALLBACK`, `route.ts:59`), one `fetch` (`:211`), a JSON body; no
parameter is ever appended.

*Proven by:* the relay "no value in a URL" vector and the SOURCE PIN.

*Non-vacuous:* the same URL mutation as criterion 1 fails it.

### 4 — The backend accepts no GET

*Held by:* the method check runs before the body is read and before any state is touched.

*Proven by:* `ebay-connect`'s "the function takes POST only — a GET answers 405, touches no state and
reads no body".

*Non-vacuous:* inverting the method check at `functions/ebayConnector.js:731` fails that case with
`GET 200 !== 405`.

### 5 — No body value is written to any log

*Held by:* every log line carries a class word; the one permitted message line is pinned.

*Proven by:* the LOG PIN, the RESPONSE PIN, and the Firestore success-path case (EBAY-REG-09).

*Non-vacuous:* adding ``console.warn(`ebay callback: got ${code}`)`` above
`functions/ebayConnector.js:828` fails the LOG PIN, which names the code's first eight characters.

### 6 — Replay, unknown or expired state, and a session mismatch all fail closed

*Held by:* the single-use transaction refuses on all four paths.

*Proven by:* `ebay-connect`'s browser / state / replay cases, and EBAY-REG-05.

*Non-vacuous:* making the burn at `functions/ebayConnector.js:862` conditional fails "a callback
without the browser's nonce is refused with reason=browser AND the state is burned"; making
`ebayTicketSpend.ts:59` permissive fails EBAY-REG-05 and four relay checks.

*One qualification, on the sentence and not the property:* the criteria file says the state is burned
"on every refusing path", and two of the four paths return above the burn
(`functions/ebayConnector.js:858` on `!snap.exists`, `:860` on used-or-expired). The criterion itself
still holds on all four — an unknown state has nothing to burn, a used one is already burned, an
expired one can never be used again. Recorded as backlog item L9.

### 7 — An eBay decline never reaches the backend

*Held by:* the decline is settled at the edge; the POST body has no `error` field, and the function
refuses a `dispose` body carrying `state` or `nonce`.

*Proven by:* the relay decline cases for `?error=access_denied` and bare `?error=`, and the
function-side 400.

*Non-vacuous:* making `route.ts:270` fall through fails both relay decline cases; neutering
`functions/ebayConnector.js:787` fails "dispose: the envelope can name no state and no nonce" and the
dispose SOURCE PIN.

---

## Ten guards deleted, ten caught

Twelve guards in the sealing route were deleted one at a time, with `test:relay`,
`test:ebay-regressions` and `functions/test/qa/ebay-connect.test.js` re-run after each. **Ten were
caught.** The two that stayed fully green are backlog item L2 — neither is a live exposure (the
shipped code is correct in both cases), but neither would notice if it stopped being correct.

## Seller-facing failure paths land on a sentence

Walked exhaustively rather than sampled. The eleven `/ebay/callback` landings (`missing_code`,
`cancelled`, malformed shape, key unset, key short, body over cap, transport failure, `connected`,
each of the eight `FUNCTION_REASONS`, replay → `state`, unverified → `browser`) all resolve through
`lib/studioflow/ebay.ts:192-223` and `EbayIntegrationSection.tsx:92-94`. `/ebay/ticket`'s 400, 429,
503 and 405 all reach `sealEbayTicket`'s `status === 204` test (`ebay.ts:310`), and both callers
(`EbayIntegrationSection.tsx:116`, `EbayStartContent.tsx:59`) print one sentence. `/ebay/start`'s six
exits each set one. **No path reaches a raw code, a status word or a technical string.**

---

## What this gate did not check

- **The native builds.** I ran neither `xcodebuild` nor `gradle`, so the brief's "Mac and Android
  compile" row is **unverified by me** rather than disputed. It needs its own run before Round 167
  ships anything native.
- **Hostinger's `x-forwarded-for` behaviour.** Whether the front end overwrites or appends the header
  is still open (deploy plan §4.3 step 10). It is the open question backlog item M1 turns on.
- **Anything requiring eBay.** No OAuth flow, no sandbox call, no contact.

## The backlog

Nothing found was blocking. Thirteen non-blocking findings — four medium, nine low — are written up in
`docs/ebay-final-gate-backlog.md`. None of them breaks any of the seven criteria; three of the four
mediums are documentation that has drifted from the code the gate just verified.
