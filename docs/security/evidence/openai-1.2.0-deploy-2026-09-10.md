# NivaDesk for ChatGPT 1.2.0 — production deploy record (10 September 2026, 00:34–00:56Z)

**Authorisation** (operator, 10 September): candidate `91cd20c3` accepted on the real-dependency-tree evidence; carry to
the source deploy branch and production deploy of the approved scope — the web connect change, then G1 (7 MCP/OAuth),
G2 (7 guide/assistant), G3 (5 mail) — by name, group by group, each verified before the next. Not authorised and not
done: Scan Tools, any platform form change, Submit. Google case 75151719 stays "awaiting reply"; the Stripe natural-traffic
watch stays open.

## 1. Carry to the source deploy branch

| Step | Result |
|---|---|
| Fetch / state | both branches equal to origin; both trees clean (0 dirty tracked files); merge-base `dc0e8caa` = the deploy branch head, so the deploy branch had **0** commits the package lacked; overlap none; `git merge-tree` clean |
| Merge | `git merge --no-ff openai-resubmission` → **`baa21204`** (parents `dc0e8caa`, `91cd20c3`), pushed; `origin/macbook-save-before-macstudio-2026-06-01` = `baa21204` |
| Preserved | `76c5e3c3` (Stripe L1) and `91cd20c3` are ancestors; `functions/stripeBilling.js` identical to the deployed `76c5e3c3`; live hotfix files present (`security/remoteFetch.js`, `studioflow-web/lib/studioflow/fileProxyGuards.ts`, `webhook-fails-closed.test.js`); the `functions/` tree equals the package head's |
| Main checkout `npm ci` | Node v22.22.3, **477 packages**, `package.json`/`package-lock.json` unchanged (0 dirty); `npm ls nodemailer` → 9.1.1; runtime 9.1.1; `nodemailer-floor` and `mail-transport-json` checks green on this install. The full suite was not re-run (product code unchanged since the real-tree run: 1,476/0) |

## 2. Before the deploy

- Project `eggcraft-studio` (firebase + gcloud), region `europe-west2`. The 19 serving revisions and traffic were recorded
  at 00:33:44Z (the "Before" column below); every service was at 100 % on one revision, Ready.
- No `NIVADESK_MCP_*` variable existed on any of the 7 G1 services or in `functions/.env` (0/0). `functions/.env` (main
  checkout, gitignored) then gained exactly one line, `NIVADESK_MCP_ORCHESTRATOR=1`; `NIVADESK_MCP_INVENTORY` and
  `NIVADESK_MCP_EMAIL_RECEIPTS` are **absent** (27 keys). Every function deployed from this checkout from now on carries the
  flag; only the MCP code reads it. Secrets stayed bound by reference; no IAM change was made.
- Local dry-load from the main checkout with the flag: 21 tools, `create_inventory_item` absent, 6 instruction lines; with
  every MCP variable unset: 19 tools.
- **Transition analysis (the deploy is not atomic).** Old MCP + new OAuth: the default grant widens (six scopes) while
  nothing enforces scope → harmless. New MCP + old OAuth: scope enforcement on while the authorize endpoint still mints
  1.1.1's two-scope grant → every connection made in the window is refused on the finance and notes tools until it
  reconnects. So G1 was deployed in two halves, **OAuth first** (`chatgptOAuthAuthorize`, `…Approve`, `…Register`,
  `…AuthorizationServer`, `…ProtectedResource`), verified, then `chatgptMcp` + `chatgptWorkspaceAction`; and the web
  connect page went live before both, since with the new OAuth an old page would still have sent the explicit narrow scope.

## 3. Web — Round 168

Publish repo `~/Developer/studioflow-hostinger-publish-20260530`, `main` at `3705865` (Round 167), clean. A full sync
would have carried 30+ other unpublished files (eBay screens, settings, `lib/studioflow`, `package.json`…), so only the
two files were copied: `app/chatgpt/connect/ChatGPTConnectClient.tsx` and `page.tsx` (+8/−2, the empty scope default).
Commit **`4be81fc`** "Round 168: the connect page lets the server decide the scope", pushed 00:34:50Z. The staged
onboarding branch `onboarding-round-168` (`f765d0e`) was not touched or included; it will need to publish as a later
round number. Live at **00:36:14Z** (chunk `page-8e00a6ad42a218ef.js`): the compiled form
`scope:null!=(i=o.get("scope"))?i:""` is present and the old literal `orders.read orders.write` is in no chunk of the page
(re-checked 00:57:57Z).

## 4. Functions — 19 of 19 successful

| Group | Command window (UTC) | Result |
|---|---|---|
| G1a — 5 OAuth | 00:40:16 → 00:43:54 | 5 × "Successful update operation", exit 0 |
| G1b — `chatgptMcp`, `chatgptWorkspaceAction` | 00:44:42 → 00:46:18 | 2 × successful, exit 0 (started only after G1a's five were Ready at 100 % with the flag) |
| G2 — 7 guide/assistant | 00:48:42 → 00:50:56 | 7 × successful, exit 0 (after G1 verified) |
| G3 — 5 mail | 00:53:13 → 00:55:27 | 5 × successful, exit 0 (after G2 verified) |

All by name; no `--only functions`; source commit `baa21204` for every group.

| Group | Service | Before | After (100 %, Ready) |
|---|---|---|---|
| G1 | `chatgptmcp` | `chatgptmcp-00072-dok` | **`chatgptmcp-00073-fuz`** |
| G1 | `chatgptworkspaceaction` | `chatgptworkspaceaction-00048-get` | **`chatgptworkspaceaction-00049-kiz`** |
| G1 | `chatgptoauthauthorize` | `chatgptoauthauthorize-00044-tew` | **`chatgptoauthauthorize-00045-has`** |
| G1 | `chatgptoauthapprove` | `chatgptoauthapprove-00043-feq` | **`chatgptoauthapprove-00044-wej`** |
| G1 | `chatgptoauthregister` | `chatgptoauthregister-00047-kax` | **`chatgptoauthregister-00048-dey`** |
| G1 | `chatgptoauthauthorizationserver` | `chatgptoauthauthorizationserver-00048-puq` | **`chatgptoauthauthorizationserver-00049-tef`** |
| G1 | `chatgptoauthprotectedresource` | `chatgptoauthprotectedresource-00043-nuc` | **`chatgptoauthprotectedresource-00044-wov`** |
| G2 | `getuserguide` | `getuserguide-00054-guh` | **`getuserguide-00055-sed`** |
| G2 | `askappassistant` | `askappassistant-00062-daj` | **`askappassistant-00063-yom`** |
| G2 | `createsupportticket` | `createsupportticket-00066-ciy` | **`createsupportticket-00067-juw`** |
| G2 | `postwebsitechatmessage` | `postwebsitechatmessage-00072-jeq` | **`postwebsitechatmessage-00073-dug`** |
| G2 | `createwebsitechat` | `createwebsitechat-00069-nap` | **`createwebsitechat-00070-yuq`** |
| G2 | `getappassistantavailability` | `getappassistantavailability-00020-jel` | **`getappassistantavailability-00021-muv`** |
| G2 | `addsupportticketreply` | `addsupportticketreply-00057-hof` | **`addsupportticketreply-00058-voz`** |
| G3 | `websitechatrequesthuman` | `websitechatrequesthuman-00002-ras` | **`websitechatrequesthuman-00003-veb`** |
| G3 | `inviteworkspacemember` | `inviteworkspacemember-00002-qiw` | **`inviteworkspacemember-00003-ruj`** |
| G3 | `createorderportallink` | `createorderportallink-00003-rub` | **`createorderportallink-00004-mat`** |
| G3 | `saveorderportalsettings` | `saveorderportalsettings-00002-mig` | **`saveorderportalsettings-00003-yos`** |
| G3 | `notifycustomeronstatuschange` | `notifycustomeronstatuschange-00009-nox` | **`notifycustomeronstatuschange-00010-dex`** |

The "Before" revisions are the rollback targets (§7).

## 5. Live verification

| Check | Result |
|---|---|
| Revisions | all 19 new revisions Ready, 100 % traffic, `latestRevision`; startup TCP probe succeeded on each; **0 WARNING-or-higher** log entries on any of the 19 since its deploy |
| Flag env | every G1 revision carries `NIVADESK_MCP_ORCHESTRATOR=1` and no other MCP variable; env parity with `functions/.env` 27/27 on the new `chatgptmcp` and `notifycustomeronstatuschange` revisions (names and values compared, not shown); secrets bound as before |
| Source ↔ commit | the uploaded zip of **each of the 19** functions compared file by file with `baa21204`: **334 of 334 tracked files identical, 0 different, 0 missing**, every zip's `package-lock.json` resolving `nodemailer` to **9.1.1** |
| **Live `tools/list`** (public discovery, fetched anonymously at 00:47Z from `https://mcp.nivadesk.app/chatgptMcp`) | **21 tools**; four literal booleans on every tool; `create_inventory_item` absent; last two `search_inventory`, `search_commerce_orders`; **byte-identical to `docs/evidence/tools-list-candidate-orchestrator-on.json`** (tools array), listing sha256 `10316e28…` = the candidate's. Saved as `docs/evidence/tools-list-live-chatgptmcp-00073-fuz-2026-09-10.json`. The three appended description sentences are on the wire (`create_order`, `update_order_status`: "…it can send the customer an e-mail or SMS. Say so before you do it."; `attach_bank_receipt`: "…replaces it, and the previous file is deleted."); the corrected hints read `create_order` F/F/F/**T**, `update_order_status` F/T/**F**/**T** |
| `initialize` (public) | protocol 2025-06-18; instructions **6 lines** including the customer-message line; `serverInfo.version` still `0.1.0` (cosmetic, §5.6, unchanged on purpose) |
| Anonymous tool call | MCP `tools/call` without a bearer: refused as a tool error ("Missing Authorization: Bearer <Firebase ID token>", `isError: true`, HTTP 200 JSON-RPC) — the pre-existing shape; REST `chatgptWorkspaceAction` without a token: **401** |
| OAuth metadata (after G1a) | `/.well-known/oauth-protected-resource` and `/oauth-authorization-server`: 6 `scopes_supported`, S256 |
| Guide | `getUserGuide`'s deployed zip carries the rebuilt corpus: EN "What you can ask" 6 bullets incl. the channel search and the stock search, "Coming…" 2 bullets (the caveat "The one below" + the photo add); TR the same (6 / 2, "Aşağıdaki tek madde") |
| Mail functions' dependency | `nodemailer` **9.1.1** in the lockfile of every deployed zip (all 19, incl. the 8 that send mail) |

**Traffic.** Since the deploy the only requests on the 16 callable/HTTP services are this verification's own probes
(`chatgptmcp` 8 × 200, `chatgptworkspaceaction` 1 × 401, the two metadata documents 1 × 200 each); the other 13 have
received none. `notifycustomeronstatuschange` (a Firestore trigger) ran three times at 00:55:04–06Z — **on the old
revision `00009-nox`**, during the rollout, before `00010-dex` took traffic at 00:55:16–20Z. **No new revision has yet
served a real user request: live behaviour is not observed.** No e-mail was sent by this verification, and no order,
payment or status was created or changed.

**Not done — the review-account OAuth connection and read-only smoke.** A connection needs a Firebase ID token for
`review@nivadesk.app`. Without a password (which is on the platform form and is not handled here) the only route is a
custom token, and signing one needs `iam.serviceAccounts.signJwt` on a service account — `testIamPermissions` returns
none for this operator account on any of the project's four service accounts (`roles/owner` does not carry it), and
granting it would be an IAM change this deploy was told not to make. The smoke script is written and prints only counts
and booleans (`oauth-smoke.sh` in the session scratch); it needs one of: (a) a temporary
`roles/iam.serviceAccountTokenCreator` grant on `firebase-adminsdk-fbsvc@…` for the operator, run, then revoked; or
(b) the operator reconnecting the review account from ChatGPT (the "reconnect" step is required anyway — every
pre-flip token carries two scopes), after which the connection and a read-only call are verified server-side from the
logs and the `chatgptOAuthTokens` record. The public listing and the metadata are verified without it.

## 6. What the flip changed for existing connections

Every OAuth token minted before 00:46Z carries 1.1.1's two-scope grant and is now **refused on the finance and notes
tools** by `nvMcpAssertScope` until that connection is made again — the review connection included (submission doc
§5.4, §6 step 6). Membership, role and area checks are unchanged.

## 7. Rollback

Per group, to the "Before" revision in §4's table (`gcloud run services update-traffic <service> --region europe-west2
--project eggcraft-studio --to-revisions <before>=100`):

- **G1** (all seven together, OAuth and MCP, never one half): reverts the 1.2.0 wire to the 1.1.1 listing and turns
  scope enforcement off; **and** delete `NIVADESK_MCP_ORCHESTRATOR=1` from `functions/.env` so no later deploy re-flips.
  Tokens minted after the flip keep the six-scope string and, with the flag off, gain nothing (package §6).
- **G2**: reverts the guide corpus to the 1.1.1 text (the two searches back under "Coming"); do it together with G1 if
  G1 is rolled back, or the bot offers tools the app no longer publishes.
- **G3**: independent; rolling back re-opens the nodemailer advisory on those five.
- **Web**: the previous round (`3705865`); it can also stay (with the flag off the server's default is the same two scopes).

## 8. Remaining, for the next command

1. Review-account OAuth reconnect + read-only smoke (§5, blocked here; two options).
2. Platform: Scan Tools on a new draft version, verify 21 × 3 scanned hints against §5's listing (four on the wire),
   paste the justifications, Description, Release Notes, test cases (package §7) — then Submit. Write-requiring review
   tests (`update_order_status` with automatic updates off, `attach_bank_receipt`) belong to that step.
3. Watch: the new revisions have no real traffic yet; the queries in the package and in
   `stripe-l1-deploy-2026-09-10.md` §4 apply the same way (no alert policy exists).
4. Housekeeping: `onboarding-round-168` needs a new round number; the main checkout's `.env` now carries the flag.

**Deploy verdict:** all 19 functions and the web round succeeded and match the source; nothing partial. The one open
verification item is the review-account connection (§5), not a deployment failure.

## 9. Review-account OAuth connection and read-only smoke — done (10 September, 01:05–01:13Z)

**Path: the normal user login and OAuth flow, no custom token, no IAM change, no password handled here.** The
account and workspace were taken from the testing instructions (`review@nivadesk.app`, readiness §2) and verified
read-only against Firebase Auth and Firestore before anything else: uid `KSQidetb3oOSItE9amLISf9Lh6h2`, one owned
workspace `KSQidetb3oOSItE9amLISf9Lh6h2` ("My Studio", pro_monthly, active, 1 member). The browser's own session was
not assumed: the in-app browser opened the flow with no cookies.

| Step | Result |
|---|---|
| Dynamic client registration (`POST /chatgptOAuthRegister`, the same call ChatGPT makes) | **201**; client "NivaDesk release smoke 2026-09-10 (operator-driven)", `redirect_uris` echoed as `http://localhost:8765/callback` (http allowed on localhost only), `token_endpoint_auth_method: none` |
| Authorize (`GET /chatgptOAuthAuthorize`, PKCE S256, `state`, **no `scope` parameter** — as ChatGPT sends it) | **302** to `https://nivadesk.app/chatgpt/connect?…&scope=<six names>` — the flag-on server default, six scopes, passed through to the consent page |
| Consent page (Round 168 build, in-app browser) | "Connect NivaDesk" with the notice "…will send the authorization to localhost:8765"; the e-mail field was filled by the assistant, **the password was typed by the operator**, then "Sign in and continue" → workspace "My Studio" → Allow. Endpoint log: `chatgptOAuthWorkspaces` 200, `chatgptOAuthApprove` 200 (plus one CORS 204 each) — all on the new revisions |
| Callback | received on the local listener at **01:11:00Z**, `state` matched, no error; the code was exchanged and the file deleted |
| Token (`POST /chatgptOAuthToken`, `code_verifier`) | **200**, `token_type: Bearer`, `expires_in: 2592000` (30 days), **6 scopes granted** — the widened default, exactly what the flag-on listing needs (submission doc §5.4) |
| Server record | `chatgptOAuthTokens`: a new row created 01:11:16Z for the review uid, `companyId` = the review workspace, 6 scopes, `source` and `uid` fields (the current record shape); nothing revoked, nothing else touched. The review uid also holds **23 older records** (May–September, with 3-, 5- and 6-scope grants) — every one minted before the flip and therefore refused on the finance and notes tools under enforcement until that client reconnects; the ChatGPT-side review connection is one of them and **must be reconnected before the review test cases are run** |

**Authenticated MCP calls with the real token** (`https://mcp.nivadesk.app/chatgptMcp`, revision `chatgptmcp-00073-fuz`
— 10 × HTTP 200 in the request log since 01:11Z, no warnings):

| Call | Arguments | Outcome |
|---|---|---|
| `initialize` | — | protocol 2025-06-18, 6 instruction lines |
| `tools/list` (authenticated, not the anonymous discovery) | — | **21 tools**, same listing hash `10316e28…` as the anonymous fetch and the candidate snapshot |
| `search_orders` | `query: "OpenAI Review Test"` | **SUCCESS** — "Found 1 order(s)."; `structuredContent.orders` = 1 row with the order fields (id, status, designStatus, priority…) |
| `get_order_detail` | `orderId: 22uckzfA8lGXYjj1JxCM` (the review test order) | **SUCCESS** — one order object, id present, status and design fields present |
| `search_commerce_orders` (new) | `query: "OpenAI Review Test"` | **SUCCESS** — envelope `ok/action/state/data/freshness/partial/warnings/entityRefs/suggestedActions/summary`; 1 entity ref, 0 warnings, **no money-shaped key** |
| `search_inventory` (new, the canonical search) | `{}` | **SUCCESS** — same envelope, **5 entity refs** (the review workspace already holds stock items), 0 warnings, no money-shaped key |
| `get_bank_spending_summary` | `{}` | **SUCCESS** — connected feed, period, totals, 9 receipts waiting for the bank, 2 recurring subscriptions, 0 categories/top merchants (an owner reading their own feed) |
| `search_bank_transactions` | `query: "ESET"` | **SUCCESS** — 1 transaction returned (the review feed's ESET row) |

Nothing was refused: the review account is the workspace owner, so every gate — membership, Orders area, Financial
permission, Bank Spending (owner) — and the six-scope grant let the reads through. **No permission-denied and no empty
result occurred**, so neither classification was exercised on this account; the role/area refusals are pinned by
`mcp-permissions` (25 checks) rather than observed here. No write tool was called; no order, item, status, message or
e-mail was created or sent.

**Server-side behaviour, PII-free.** `companies/<review ws>/piiAccessLog` gained **7 rows at 01:11:18–56Z**, one per
read that hands over a person, `source: mcp`: `search_orders` ×2 (subject kind `order`, no id — a set read; categories
name/email/phone/address), `get_order_detail` ×2 (`order`, id present), `search_commerce_orders` ×1 (`order`, name/email
— the registry's categories for it), `get_bank_spending_summary` ×1 and `search_bank_transactions` ×1 (`bank_transaction`,
`name` — the two bank rows that ship behind the flag). `search_inventory` filed none (stock carries no person). That is the
disclosed carve-out, row for row as `docs/mcp-tool-annotations.md` describes it, on the live revision.

**Housekeeping.** The smoke connection ("NivaDesk release smoke 2026-09-10") is a live 30-day grant for the review
workspace; the operator can end it under Settings ▸ Account ▸ ChatGPT connections whenever convenient — no other
connection was removed or altered. The private scratch files (code, verifier, token) were deleted after use; none of
them was printed or committed.

**Remaining for the next step.** (1) Reconnect the ChatGPT-side review connection (pre-flip grant). (2) Test data: the
review workspace already holds stock items (5 refs) and the ESET row exists; the ESET row must be reset to "no receipt"
before test case 5; test cases 1–3 figures to re-verify on the workspace. (3) The write-requiring cases
(`update_order_status` on an order with automatic updates off, `attach_bank_receipt`) belong to the platform-form step.
**No blocker remains for Scan Tools and the form update:** the listing the scanner will read is the one recorded in §5,
and the authenticated path is proven end to end.
