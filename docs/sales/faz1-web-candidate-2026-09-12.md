# Sales web, Faz 1 — candidate record

Branch `sales-web-faz1`, cut from the release candidate `05040bf3`. **Not merged into the RC, not merged into the deploy branch, nothing deployed, no Round published.** Verified locally against the Firebase emulator suite.

## What it is

`/sales`, with three tabs, over callables that already exist plus two narrow new reads.

| Tab | Source | State |
|---|---|---|
| **Sales** | `listSalesRows` — the canonical read, unchanged | working: server paging, filters, money gate, assigned scope |
| **Products** | **new** `listSalesProducts` | working, and honestly empty — see below |
| **Channels** | **new** `listSalesChannels` | working: connected / not connected per channel |

The projection from PR 3 is **not** used. The list reads `siparisler` through `listSalesRows`, which is never stale, so nothing on this screen depends on an asynchronous copy.

## The two new reads, and why they had to exist

Products and Channels had no read contract at all. Rather than draw either from demo data, each got a narrow server candidate first:

* **`listSalesProducts`** reads `companies/{cid}/salesProducts`. Nothing writes that collection yet, so it returns an empty list and says `catalogExists: false`. The screen says there is no catalogue and why, in the merchant's words. It invents no sample rows: a screen showing made-up products beside real orders is worse than one that says there is nothing here.
* **`listSalesChannels`** reads the five connection collections (`shopifyStores`, `etsyConnections`, `wooConnections`, `squareConnections`, `ebayConnections`) filtered by workspace and returns **counts only** — no shop name, no external id, no token. A collection it cannot read is reported `unavailable`, which is a different answer from "not connected". **Amazon is deliberately absent**, the same reason as the Sync health card: its connections live in the hardened project behind a service-account call, and guessing would be worse than saying nothing. The screen says so in a line under the list.

Both are flag-gated and permission-gated exactly like `listSalesRows`, and both refuse a member without orders access and a workflow-only member.

## Verified locally, against the emulator

Seeded with `functions/test/qa/seed-sales-web.js`, which uses ids and addresses of its own (`salesweb-*`, `@salesweb.invalid`) so that nothing resembles EGGcraft's real workspace, the retention pilot or the OpenAI review identities.

| Check | Result |
|---|---|
| Sales and Orders open the same order | every customer cell links to `/orders?selectedOrderId=<orderId>`, the same route the Customers and Schedule screens use |
| Assigned-scope member | sees exactly their two orders, with the banner "You are seeing the orders assigned to you, the same ones Orders shows you" |
| Money follows the finance permission | a member with `financialInfo: false` sees every Revenue cell as "—", with the rest of the row intact |
| Withheld buyer | the eBay row reads "Held by the marketplace" rather than a name |
| Empty catalogue | real empty state with a reason, no invented rows |
| Empty filtered page | "No sales match these filters." — distinct from the no-sales-at-all message |
| Paging | "Show more" carries the server's cursor; the list appends rather than replaces |
| Loading and error | per-tab, with the previous content left alone rather than blanked |
| Late answers | every load is stamped with a request ticket and the workspace it was for; an answer that arrives after the account or workspace changed is dropped, never painted onto the new screen |
| Desktop 1440×900 | table and filters lay out cleanly |
| Phone 390×844 | filters wrap, the table scrolls inside its own container, the page itself never scrolls sideways |
| Console / server logs | no errors, in the pane or in the dev server |

`npx tsc --noEmit` 0 · `npm run build` 0 · `npm test` 1812 passed, 0 failed.

## Deliberately not done

* **No New sale, no product creation, no stock, payment or listing write.** The only imports in the page are the four reads in `lib/studioflow/sales.ts`; there is nothing else to call.
* **`/sales` is not wired into the navigation menu.** The capability answer already carries `showInMenu`, but with the pilot allowlist empty the entry would be dead for every workspace that saw it. Wiring it is a one-line change at the moment a pilot workspace exists — and it is a decision, not an oversight.
* **The projection is not read.** PR 3 stays a separate candidate.

## Native impact

* **None required.** The two new callables are additive; no native client calls them, and no native build is needed for this candidate.
* The `salesOrders` rules change carried in the RC (`05040bf3`) affects any client reading the projection directly. No native client does, and none should: the collection can no longer be listed from a client at all, so a native Sales screen (PR 5) must use `listSalesRows` exactly as this web screen does.
* When PR 5 adds the native entry, it inherits the same three constraints: the list is the server's, money follows `financeVisible` from the response, and the assigned scope is decided by the server rather than by a filter in the client.

## Before this could be released

1. **Translations.** The screen's strings go through `studioT`, which falls back to English, so a Turkish or Japanese merchant would read an English Sales screen. Roughly thirty new strings need entries in `lib/studioflow/language.ts`.
2. **A guide entry.** Every shipped feature gets one; this has none yet.
3. The pilot allowlist, which is a separate decision and is still empty.
