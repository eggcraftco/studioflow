# Work Time card — day entry (full day / half day) — contract, 14 Oct 2026

Owner request: the time-tracking card ("Working" in the owner's words; the order-detail card `workTime`,
default heading **Work Time**, per-trade headings Bench Time / Studio Time / Machine Time / Kitchen Time) must,
besides the timer, let a person record for a day that they worked a **full day** or a **half day**, without
running the timer.

## 1. What exists today (read from code, not assumed)

| | Where | Notes |
|---|---|---|
| Timer data | `siparisler/{orderId}.workSessions` — an **array on the order document** | Per order, not per member. Each session: `id, title, startedAt, endedAt, durationSeconds, createdAt, createdByUid, createdByEmail, source`. |
| Web writes | callable `updateWebOrder` with `workTime: {action: start\|continue\|stop\|delete, …}` | `applyWebWorkTimePatch` (functions/index.js). A started session is always the caller's (`createdByUid = uid`). Stop/delete: any session, by anyone allowed to edit Work Time. |
| Android writes | same callable (`StudioFlowRepository.updateOrderFields`) | |
| iOS / macOS writes | the whole order: Firestore merge (paid plans) or `saveSwiftOrder` (Free/Starter, Workflow Only, assigned-only) | `workSessions` is in the app's clearable list. |
| Who may edit Work Time | owner / admin / member / Workflow Only, with the `orders` key on; assigned-projects-only members only on orders assigned to them | Server: `canFullyEditOrder \|\| canEditWorkflowOnly` + `uidCanAccessWorkspaceArea(…, "orders")` + `requireAssignedProjectAccess`. Clients: web `canEditOrderStatus`, iOS `canEditOrderDetails`, Android `canEditWorkflow`. View-only cannot. |
| Workflow Only reads | `companies/{cid}/workflowOrders/{orderId}` (a view the server writes, field list `WORKFLOW_ORDER_VIEW_FIELDS`) | The view carried `workSessions` but nothing new — a new field must be added there or Workflow Only members never see it. |
| Finance | **not tied.** No finance, invoice, PDF or export code reads `workSessions` (only the app backup copies it). | Nothing in finance changes. |
| Workspace time zone | **does not exist** (no setting in companySettings; the server's schedules use Europe/London) | See §2 "date". |

## 2. Model

Order document field **`workDays`** (array), beside `workSessions`:

```
{ id: "<memberUid>_<date>",   // one entry per member per day — saving again replaces it
  date: "YYYY-MM-DD",         // calendar day as picked on the device (default: today, local)
  kind: "full_day" | "half_day",
  memberUid, memberEmail,     // always the caller (server-stamped)
  note: string (≤ 280, optional),
  createdAt, updatedAt (server Timestamps), source: web|ios|mac|android|app }
```

- Value: full = **1**, half = **0.5**. Summaries show "Days worked: 1.5" beside the timer's total hours; the
  timer total is unchanged (days are not converted to hours).
- **date**: there is no workspace time zone, so the date is a plain calendar day, never converted. The server
  refuses an invalid date, a date before 2000, or one later than tomorrow in UTC (so UTC+14 can log "today").
- Timer sessions are untouched: the timer's actions, ids and totals behave exactly as before.

## 3. Write path (one, on the server)

`updateWebOrder` accepts `workDay`:

| action | input | rule |
|---|---|---|
| `set` | `date, kind, note?, memberUid?` | Adds or replaces the **caller's** entry for that date. `memberUid` other than the caller → `permission-denied` ("You can log only your own days.") — owner included: the timer cannot start a session for someone else either. Same kind + note again = no change. |
| `delete` | `date, memberUid?` | Own entry; the **owner or an admin** may also delete another member's entry (a correction). A member/Workflow Only deleting someone else's → `permission-denied`. Missing → `not-found`. |

Gate = the timer's gate, unchanged (`(canEditFullOrder || canWorkflowEdit) && orders key && assigned-project check`).
Every change adds a history row (`Work day logged / changed / deleted`, value `date · Full day`).

Clients never write `workDays` directly: web and Android send the patch; iOS/macOS keep the field **beside** the
`Siparis` model (`NDOrderWorkDays`, like `NDOrderOrigins`), so neither the merging write nor `saveSwiftOrder` can
carry a stale copy back, and send the patch through the same callable.

Deliberate difference from the timer: deleting someone else's entry is owner/admin only (the timer lets any
editor delete any session). Decision point for the owner if it should match the timer exactly.

## 4. Server change (required) and rules (not required)

Required, because (a) Workflow Only members cannot write `siparisler` at all, so only the callable can record
their day, and (b) they read the `workflowOrders` view, which must carry the new field.

| Lineage (live archive, read 14 Oct) | Functions | Change |
|---|---|---|
| A — `updateWebOrder` 00133 (archive = `nivadesk-deploy-2026-10-08/assigned/B`, index.js sha1 087106f1…) | `updateWebOrder` | `workDays.js` (new, pure) + 46-line index.js patch (`workDay` patch, gates, view list) |
| B — `syncWorkflowSafeOrderView` 00020 / `ensureWorkflowAssignedOrderViews` 00020 (archive = `wfview/r2`, sha1 07f87abd…) | both | `"workDays"` added to `WORKFLOW_ORDER_VIEW_FIELDS` (1 line) |

Deploy trees: `~/Developer/nivadesk-deploy-2026-10-14/working-day/A` and `/B` (live archive + this change only,
live-era firebase.json and dotfiles). **Order:** A and B first, then web, then native. Old clients ignore the
field. The live `updateWebOrder` ignores an unknown `workDay` key and answers ok with `changed: false`: the web
treats that as a failure ("Could not save the day entry."); iOS/Android would show nothing saved (no entry comes
back) — so the server goes first.

Firestore/Storage rules: **no change needed** — clients do not write the field; the server writes with admin
rights. Known gap, same as the timer's today: a member with direct write access to `siparisler` could write
`workDays` by hand (as they can `workSessions`). Closing it is a separate rules decision (deny the field on
client writes); not part of this package.

## 5. Not changed / limits

- Finance, invoices, PDF export, CSV export: unchanged (none read work time).
- App backup / restore (web export, iOS backup, `importWorkspaceBackup`): `workDays` is **not** in the backup
  yet — a restore brings orders back without day entries. Follow-up if wanted.
- No per-member report screen; the card shows each entry (date · kind · member · note) and the total.
