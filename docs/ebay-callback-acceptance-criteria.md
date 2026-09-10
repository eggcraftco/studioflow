# The seven criteria the eBay callback is judged against

Written down because a gate agent could not certify them: they existed only in a chat instruction and
were quoted in the tree by number, so four of the seven had nothing to check against. This file is
that something. It is the operator's list, unchanged.

| # | Criterion | Where the code makes it true | The test that fails without it |
|---|---|---|---|
| 1 | The browser nonce appears in no URL anywhere | the nonce lives in a callable reply, a cookie and a signed POST body; the function refuses any query string outright | relay vector "the route puts no value in a URL"; `ebay-connect` query-string → 400 and the SOURCE PIN's `req.query` assertion |
| 2 | The browser/session binding is verified in the web layer | `lib/studioflow/ebayTicket.ts` verifies shape, MAC, window, the state match and the nonce tag **before** anything is signed | relay cases 1, 2, 3, 4, 6, 7 |
| 3 | Code and state reach the backend only in a server-to-server POST body | one module constant, one `fetch`, a JSON body; no parameter is ever appended | relay "no value in a URL"; SOURCE PIN |
| 4 | The backend accepts no GET | method check before the body is read and before any state is touched | `ebay-connect` "the function takes POST only — a GET answers 405, touches no state and reads no body" |
| 5 | No body value is written to any log | every log line carries a class word; the one permitted message line is pinned | LOG PIN, RESPONSE PIN, and the Firestore success-path case |
| 6 | Replay, unknown or expired state, and a session mismatch all fail closed | the state is burned inside the transaction on every refusing path | `ebay-connect` browser/state/replay cases; EBAY-REG-05 |
| 7 | An eBay decline never reaches the backend | settled at the edge; the POST body has no `error` field and the function refuses a body carrying `state` or `nonce` | relay decline cases for `error=access_denied` and `error=`; function-side 400 |

**Criterion 2 was, until the ticket landed, met in substance rather than literally** — the web layer
observed a cookie's presence and the function decided its correctness. The signed browser-binding
ticket closed that: the web layer now verifies, and refuses, before it signs anything.

**What none of the seven covers, and no test can:** eBay delivers the code and the state to the
accepted URL as query parameters, so Hostinger's access log receives them. That is a separate,
recorded problem with its own decision (`docs/ebay-callback-platform-logging.md`), and the production
answer is to move the callback to a Worker on `connect.nivadesk.app`.
