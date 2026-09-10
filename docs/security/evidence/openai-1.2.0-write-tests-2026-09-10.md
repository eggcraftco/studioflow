# OpenAI 1.2.0 — write-tool tests on the review workspace, 10 Sep 2026 (night)

Workspace: the review account's only workspace (`KSQidetb3oOSItE9amLISf9Lh6h2`, "My Studio"), demo data
only. Handlers were called through the dispatcher (`_nvChatGPTDispatchAction`) with a first-party owner
context and ADC, i.e. the same code the MCP server runs, against production Firestore/Storage. No OAuth
token, password or code appears in this note. Read-only figures for the test cases were re-verified the
same way (`docs/night-report-2026-09-10.md` carries the numbers used on the platform form).

## 1. `update_order_status` — notifications OFF, no customer contact (01:55 UTC)

Fixture created with `create_order` (so it carries `createdFrom: "chatgpt"`):

| | |
|---|---|
| order | `pMfJ9be6wE1ZC1wzmns1` — "Status Change Test Order", customer "OpenAI Status Test Customer" |
| contact fields | `emailAddress` empty, `whatsappNumber` empty (never set) |
| `portalAutoUpdates` | `{enabled:false, email:false, sms:false}` (set on the fixture right after creation) |

| step | status | `historyLog` length | `portalLastNotifiedStatus` |
|---|---|---|---|
| after create | Not Yet | 2 | — |
| `update_order_status` → In Progress | In Progress | 3 | — |
| `update_order_status` → In Progress again (same value) | In Progress | 4 | — |

- Second identical call appended a second history entry with a fresh id → `idempotentHint: false` as
  justified.
- `notifyCustomerOnStatusChange` ran on the writes (13 log lines 01:55:05–01:55:45, no send: the order
  has no address and auto-updates are off, so the trigger returns before any provider call; no
  `sendPortalStatusEmail`/Twilio line in the window). `portalLastNotifiedStatus` stayed unset.
- The fixture stays in the workspace for the platform's test case 5; its status may be anything from
  an earlier run and the expected result is the same.

**Caution recorded for the reviewer-facing data:** 16 of the 25 review orders (including the review
test order) carry a demo `emailAddress` on real-looking domains and no `portalAutoUpdates` block, which
the trigger treats as *enabled with e-mail on*. A status change on any of those from ChatGPT would try
to e-mail that address. The test cases only change the fixture above; no other order's status is
changed by any case. Morning decision: set `portalAutoUpdates.enabled=false` on those 16 demo orders
(reversible: the field is absent today) or leave as is.

## 2. `attach_bank_receipt` — synthetic ESET row (01:59 UTC)

Row `companies/…/bankTransactions/demo-acc_demo006` — `demo: true`, account `demo-acc`, connection
`demo-hsbc` (`demo: true`), -53.99 GBP on 2026-08-13, merchant "ESET.com UK Bournemouth". All 26 rows of
the review feed are `demo-acc`; nothing here is a real bank transaction.

| | |
|---|---|
| before | receipt `…/demo-acc_demo006/1788460645594_sample-invoice-eset.png` (artifact of a 3 Sep test run) |
| call | `receipt: {download_url: https://mcp.nivadesk.app/demo/sample-invoice-eset.png, file_id, mime_type: image/png, file_name}` |
| result | `attached: true`, `transactionId: demo-acc_demo006`, `matchScore: 75`, `readFromDocument: {amount: 53.99, date: 2026-08-13, ocr: true}` in 1.5 s |
| after | receipt `…/demo-acc_demo006/1789005642971_sample-invoice-eset.png`; previous object **deleted** by the handler (`exists() → false`), new object present |
| search | `search_bank_transactions` "ESET" → the row with `hasReceipt: true` |

- Replace-and-delete on a second attach → `destructiveHint: true` as justified; the fetch of the
  document and the Vision OCR call → `openWorldHint: true`.
- First local attempt failed before any write ("Bucket name not specified" — the local ADC app had no
  default bucket; the row was untouched) and a second attempt skipped OCR (no quota project on user
  ADC) and returned the "tell me the amount/date" error without attaching. Both are local-run
  conditions, not production behaviour; the successful run set `FIREBASE_CONFIG.storageBucket` and
  `GOOGLE_CLOUD_QUOTA_PROJECT`.

Reset for the reviewer (test case 3 starts from "no receipt", as on 22 Aug): `receiptName` and
`receiptPath` cleared on the row after the test; the object written by the test is left in place
under the transaction's folder (no delete; it is not referenced by any row).

## 3. Read-only checks used by the new test cases (01:48–01:53 UTC)

- `search_commerce_orders` "OpenAI Review Test Customer" → 1 of 1, channel `manual`/`typed`, payment
  `partially_paid`, fulfilment `fulfilled`, workflow In Progress / Done, due 2026-07-19, freshness
  `sources: []`, summary "1 order(s) listed of 1 matching"; no amount, no currency in the row.
- `search_inventory` "Rolex Oyster Perpetual" → 2 of 2: INV-00003 "Ladies Rolex Oyster Perpetual Date
  Two Tone 6517", INV-00002 "Rolex Oyster Perpetual White Dial (2020 – 114300 – Box and Papers –
  39mm)"; category Watches, tracking unique, status available, onHand 1, reserved 0, masked serial;
  no price field; freshness source `state: "unsupported"`. The workspace holds 5 items, all watches.
- `get_bank_spending_summary` `{year: 2026, month: 8}` → totalSpent 626.19, 15 transactions,
  incoming 4,050.50, net 3,424.31, categories Materials 196.95 / Fees 166.58 / Shipping 93.28 /
  Software 75.19 / Subscriptions 65.09 / Rent 29.10, recurring ACCOUNTANCYPARTNER 166.20 and Adobe
  32.99. `{period:"2026-08"}`, `{month:"2026-08"}` and `{from,to}` all fall back to the current month
  (September, empty) — the prompt therefore says "August 2026".
- `get_dashboard_summary` → 25 orders (7 active, 17 completed, 1 cancelled, 1 overdue), revenue
  72,358.06, paid 65,648.06, outstanding 6,710, total cost 21,677.38, profit 50,680.68 — after the
  fixture in §1 it is 26 orders; the dashboard case was dropped from the five slots for this reason.
