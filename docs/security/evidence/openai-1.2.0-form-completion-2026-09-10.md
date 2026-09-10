# NivaDesk 1.2.0 — Scan Tools and form completion (10 September 2026, morning)

App `asdk_app_6a39221273d88191b7d51b4b81b65819` (org EGGCRAFT LIMITED), draft version
`asdk_app_v_6aa205eb7e0881919a4eb2032980f357` — the one 1.2.0 Draft in the version list (1.1.1 Rejected, 1.0.0
Published); opened from the list's **Edit**, not from a bare edit URL; no second draft exists. **Submit was not
pressed.** No deploy, no IAM, no record or token touched.

## 1. Scan Tools

Run from the draft's MCP section against `https://mcp.nivadesk.app/chatgptMcp` (live revision `chatgptmcp-00073-fuz`,
unchanged since the night's wire capture). The platform's OAuth used ChatGPT's client (restored 08:45 UTC) through
the normal consent page — review account, workspace "My Studio"; our logs: `chatgptoauthauthorize` 302 08:55:55,
`chatgptoauthapprove` 200 08:56:20, `chatgptoauthtoken` 200 08:56:24 (`openai-connectors-oauth/1.0`), then the
scanner's MCP calls 08:56:29–32 (`openai-mcp/1.0.0` ×8 and `Python/3.13 aiohttp` ×3, all 200/202).

**Result: 21 tools, no `create_inventory_item`.** Every hint the platform shows is marked "Explicitly provided by
your MCP server". Platform value vs the wire (`docs/evidence/tools-list-live-chatgptmcp-00073-fuz-2026-09-10.json`)
vs the registry (`functions/orchestrator/registry.js`, orchestrator flag on):

| Tool | Platform RO / OW / D | Wire RO / OW / D / **I** | Registry | Match |
|---|---|---|---|---|
| create_order | F / T / F | F / T / F / F | same | ✓ |
| search_orders | T / F / F | T / F / F / T | same | ✓ |
| get_order_detail | T / F / F | T / F / F / T | same | ✓ |
| add_order_note | F / F / F | F / F / F / F | same | ✓ |
| update_order_status | F / T / T | F / T / T / F | same | ✓ |
| create_note | F / F / F | F / F / F / F | same | ✓ |
| search_notes | T / F / F | T / F / F / T | same | ✓ |
| get_note_detail | T / F / F | T / F / F / T | same | ✓ |
| append_note | F / F / F | F / F / F / F | same | ✓ |
| update_note | F / F / T | F / F / T / T | same | ✓ |
| pin_note | F / F / F | F / F / F / T | same | ✓ |
| archive_note | F / F / F | F / F / F / T | same | ✓ |
| get_order_financials | T / F / F | T / F / F / T | same | ✓ |
| get_dashboard_summary | T / F / F | T / F / F / T | same | ✓ |
| get_extra_spending_overview | T / F / F | T / F / F / T | same | ✓ |
| get_financial_overview | T / F / F | T / F / F / T | same | ✓ |
| get_bank_spending_summary | T / F / F | T / F / F / T | same | ✓ |
| search_bank_transactions | T / F / F | T / F / F / T | same | ✓ |
| attach_bank_receipt | F / T / T | F / T / T / F | same | ✓ |
| search_inventory | T / F / F | T / F / F / T | same | ✓ |
| search_commerce_orders | T / F / F | T / F / F / T | same | ✓ |

21 of 21 match on the three hints the platform shows. **idempotentHint** is not shown by the platform; it was
verified on the wire (column I) and its per-tool justification is kept in the Release Notes appendix (§3).

## 2. Tool justifications (63 fields)

Each field is a 200-character single-line input. The approved package lines (`platform-justifications.json`, up to
372 chars) were shortened to fit without dropping any disclosed effect: the access-log row on every read that shows a
person, the customer notification fired by `create_order`/`update_order_status`, Google Vision OCR and the
model-supplied URL fetch in `attach_bank_receipt`, and the replace-and-delete of a previous receipt. The platform had
pre-filled some fields with the 1.1.1 boilerplate ("performs no writes", "does not browse the internet or any external
data source") — all 63 now carry the accurate text. Filled ~09:05 UTC, "Draft saved" confirmed and re-read after reload (§4).

## 3. Other sections

| Section | State |
|---|---|
| Info | name, version 1.2.0, subtitle, approved Description, category Productivity, identity Business — NivaDesk, author EGGCRAFT LIMITED, four URLs, demo video, directory + composer icons (night, persisted) |
| MCP | server URL, OAuth (auto-discovered), scan + 63 justifications (this morning) |
| Skills / Prompts | none (optional) |
| Testing | credentials text (password placeholder **left for the operator**), 5 positive + 3 negative cases (night); TC1 now also states the result observed through the real ChatGPT connection this morning |
| Global | English (US), all countries |
| Submit | Release Notes = approved text + the idempotentHint appendix; the seven attestations and the mature-content choice **untouched** |

## 4. Verification after reload

Each section was reloaded from the server (fresh navigation to the draft's own URL, ~09:12 UTC) and read back:

| Section | Read back |
|---|---|
| MCP | 21 tools with the values in §1; **63 / 63** justification inputs filled, first "Writes a new order document in siparisle…", last "Searching cannot alter an order: no fiel…" |
| Testing | 27 / 27 fields filled (credentials text with the password placeholder, 5 × 4 case fields, 3 × 2 negative fields); TC1 ends with the sentence added this morning |
| Submit | Release Notes 5,646 characters ending with the idempotentHint appendix; 0 of 7 attestations checked; mature-content choice unselected; the only remaining issue the page lists is "Submit is incomplete — This confirmation is required." |
| Version list | one Draft (1.2.0), 1.1.1 Rejected, 1.0.0 Published |

Fixture start states, read-only, same time: ESET demo row `demo-acc_demo006` carries **no receipt**; status fixture
`pMfJ9be6wE1ZC1wzmns1` ("Status Change Test Order") has no e-mail, no phone, `portalAutoUpdates` off; the review order
is unchanged (In Progress, paid 5,300, remaining 900). No test was re-run this morning; the night's write-test evidence
stands (`openai-1.2.0-write-tests-2026-09-10.md`).

## 5. Left for the operator

- Testing → Test credentials → replace `[operator: paste the review account password here before submitting]`.
- Submit → the seven attestation checkboxes and the "No — suitable for individuals under 18" choice.
- The Submit for Review button.

## 6. Submitted

The operator entered the review-account password, ticked the seven attestations, chose "No" for mature content and
pressed **Submit for Review** themselves. Read back from the version list at 2026-09-10T09:12Z: **1.2.0 — Review**, 1.1.1 Rejected,
1.0.0 Published. Nothing else changed; the review outcome arrives by e-mail from openai-review@tm.openai.com (the
1.1.0 and 1.1.1 notices did) and on the same list.

