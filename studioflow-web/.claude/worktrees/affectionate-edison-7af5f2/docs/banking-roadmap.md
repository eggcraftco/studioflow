# Banking module — roadmap (from the Aug 2026 integration brief)

Source: `NivaDesk_Banking_Pandle_Integration_Brief.md` (product/design review + competitor notes) reconciled
against what already ships. Positioning stays: **NivaDesk = working/decision layer, Pandle = bookkeeping layer.**

## Status of the brief's items

| Brief item | Status | Notes |
|---|---|---|
| Bank feed, sync, categories, rules, receipts, OCR match, order linking | ✅ shipped | TrueLayer feed, `bankRules`, receipt inbox + Vision OCR, `financialExpense::Bank Spending` link |
| Weekly/monthly/yearly, incoming view, rows per page | ✅ shipped | 21 Aug |
| Team permission (read-only members) | ✅ shipped | `bankFeed` access key |
| ChatGPT tools (summary, search, attach receipt via file) | ✅ shipped, v1.1.0 in OpenAI review | |
| Pandle: match existing imported tx → confirm, ids stored, code-based mapping, OAuth server-side | ✅ code ready, ⏳ waits for Pandle app credentials | `functions/pandle.js`, `PandleCard` behind `NEXT_PUBLIC_PANDLE_ENABLED` |
| Breakdown ≠ total consistency line | ✅ 21 Aug | "£X of £Y accounted for" under spending mix |
| Spending increase shown green | ✅ 21 Aug | neutral colour unless over expected |
| Recurring "8 active · 3 possibly cancelled" | ✅ 21 Aug | |
| Uncategorised progress indicator | ✅ 21 Aug | |
| **Needs Attention** card + queues | ✅ 21 Aug | replaces "Connected accounts" tile; uncategorised / missing receipt / possible duplicate / price changed / possibly cancelled |
| Bulk review (multi-select → category / VAT) | ✅ 21 Aug (link/mark reviewed later) | |
| Category suggestions (merchant history + keyword library, "always?" prompt) | ✅ 21 Aug | heuristic first, no AI cost; AI later |
| VAT treatment per transaction (+ category default) | ✅ 21 Aug (`vatCode`, Pandle push honours it) | feeds Pandle tax-code mapping |
| Order / project link suggestions with confidence | ✅ 21 Aug (chip only when score ≥40; picker ranked) | uses open orders, dates, customer/material keywords |
| Transaction detail drawer; "Banking" tabs (Overview / Transactions / Recurring / Receipts / Rules) | ✅ 21 Aug | page renamed Banking, nav link added, drawer saves category/VAT/order/note via `bankUpdateTransaction`; Receipts tab has "No receipt needed"; Rules tab has suggested rules + match counts |
| Transactions tab: filter bar (period, queue chips, search, Select), receipt column, drawer polish | ✅ 22 Aug (live) | matches the design reference the user sent; inline order picker dropped in favour of the drawer |
| Waiting receipts: receipt sent before the payment reached the feed stays in `bankReceiptInbox`, re-scored after every sync, auto-attached on a single confident match (score ≥75, lead ≥20) + notification; web "Waiting for the bank" section with manual assign/remove; ChatGPT no-match keeps the file | ✅ 22 Aug (live, tested end to end on web + ChatGPT) · "Match now" button + OCR date fix | `bankQueueInboxReceipt`, `bankDeleteInboxReceipt`, `matchWaitingReceipts` in bankFeed.js |
| Connection health: sync failures write `syncState` (ok / needs_reconsent / error) + `lastSyncError` on the connection; 401/403/"access denied" flips to needs_reconsent immediately, other errors after 2 failures; owner notified once; web shows red "Reconnect needed" + Reconnect button, Mac/Android show the state; reconnecting the same accounts retires the stale connection | ✅ 22 Aug (live) | "Connected" used to be the stored status only and never changed when the bank stopped serving data |
| Pandle phase 1 (read-only view) → phase 2 (confirm) → phase 3 (receipt sync, rules push, order→project, bulk confirm, reverse sync after confirm) | ⏳ credentials | phase 1–2 code exists; phase 3 after live test |
| Split transaction, transfer detection, recurring price-change alerts, merchant profiles | P1 | price-change detection lands with Needs Attention |
| Cash-flow forecast, budgets, approvals, accountant mode, audit log, email receipt fetch, AI finance chat | P2 | |
| Native (Mac/iOS/Android) parity | ✅ 22 Aug — full feature, not a mirror | Same five tabs, insights and callables as the web; Mac/iPad get an inspector column, iPhone a sheet, Android a Material 3 bottom sheet. Receipts can be attached from the photo library/files on both platforms. |

## Execution order

1. Consistency fixes (accounted-for line, neutral delta, recurring counts, uncategorised progress)
2. Needs Attention card + queue filters (incl. duplicate + price-change detection in `bankInsights.ts`)
3. Bulk review
4. Category suggestions
5. VAT treatment
6. Order link suggestions
7. Drawer + Banking tabs
8. Pandle phases (when credentials arrive) + native parity

## Data model additions planned

- `bankTransactions.vatCode` ✅, `note` ✅, `receiptNotNeeded` ✅, `reviewedAt` ✅ (set by drawer save); planned: `splitLines[]`, `transferOf`
- `bankRules.{vatCode}`
- `pandleConnection.mappings[].taxCode` already exists (category default)
