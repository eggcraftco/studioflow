# eBay connector — backlog from the final gate

6 September 2026. The final adversarial gate found **no high, no critical and nothing that
invalidates any of the seven criteria**, so the release passes. Fourteen findings remain, and this is
where the operator's rule puts them: written down rather than fixed under a scope freeze, and
rather than left in a review transcript nobody re-reads.

Nothing here blocks Round 167 or the first sandbox OAuth.

**Item 1 is a production blocker.** The operator's ruling of 6 September: the spoofable-header denial
of service is accepted for sandbox and **blocks production**. No production RuName is created until
the edge header or source this stack actually trusts has been identified and spoofing is prevented.
It sits beside the platform-logging blocker, which requires the callback to move to a Worker on
`connect.nivadesk.app` with the seven Cloudflare surfaces proven empty. Both gates are on the same
door.

## Worth doing before the connector carries real sellers

| # | Finding | Why it matters |
|---|---|---|
| 1 | **PRODUCTION BLOCKER — a spoofed `x-forwarded-for` can hold Connect eBay closed for a chosen seller.** The per-address counters on the ticket route and on the callback's disposal read the first entry of that header, which a stranger controls | It is a targeted denial of one seller's connect flow, not a data risk. The real bounds behind it are the per-process and per-instance buckets, so the blast radius is one instance. Closing it needs the proxy header this stack actually trusts, which is deploy plan §4.3 step 10 |
| 2 | The same lever suppresses code disposal for a named address at the callback route | Same mechanism, smaller consequence |
| 3 | **A replay landing on a second instance is signed before it is refused.** Ticket single-use is a per-process memory | The burn and the presented-code registry still refuse it, so the outcome is correct; the cost is one signature and one Firestore read. Closing it needs a durable shared edge store, which is the design's residual 4 and an owner decision |
| 4 | `ebayReasonText` reflects `Object.prototype` keys, so `?reason=constructor` can put a function into the settings sentence | A seller can only do it to their own screen, and the sentence is not stored |
| 5 | Two guards in the sealing route have no test, including the cookie-name derivation the design calls load-bearing | Untested is not broken, but it is unpinned |

## Documents that describe an older version of the design

Each of these is a true-sounding sentence about the pre-ticket world. None changes what the code
does; all of them mislead the next reader, which is exactly how three earlier drifts survived.

| # | Where | What it still says |
|---|---|---|
| 6 | Design §5.4, the "What does not change" list | describes the pre-ticket flow in the present tense |
| 7 | `docs/ebay-callback-platform-logging.md` | argues the residual from the disposal reaching eBay first, when the presented-code registry is now the answer |
| 8 | `docs/ebay-production-callback-worker-design.md` | is entirely pre-ticket and would reintroduce the edge refusal that §5.4 proved wrong. **Read this before building the Worker** |
| 9 | Design, seven source citations | point at unrelated code after the files moved |
| 10 | `docs/ebay-callback-acceptance-criteria.md`, row 2 | names tests that do not exist under that name |
| 11 | Same file, two "Where the code makes it true" cells | overstate what the code does |
| 12 | The jti comment | says the field is read by nothing; the callback edge's spend reads it |
| 13 | "A third exception is closed" | the oversize-body path still refuses without posting |
| 14 | The callback route's comment | overstates the presented-code registry's document id |

## The rule these were filed under

The operator's instruction, so the next person understands why a finding is here rather than fixed:
a new exploitable or high security issue stops the release; medium and low hardening or documentation
findings that do not invalidate the seven OAuth invariants go to a written backlog, and the scope
stays frozen during the final review. Item 8 is the one to pick up first, because the Worker is the
next thing anyone will build.
