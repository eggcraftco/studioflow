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
| A — `updateWebOrder` 00134-nos (live archive read 15 Oct = `workflow-view-leak/W1`, index.js sha1 b1edf6c3…, carries `workflowViewLeak.js`) | `updateWebOrder` | `workDays.js` (new, pure) + index.js +43/−3 (`workDay` patch, gates, view list) |
| B — `syncWorkflowSafeOrderView` 00021-hiz / `ensureWorkflowAssignedOrderViews` 00021-nin (live archive = `workflow-view-leak/W2`, sha1 e95b05e3…) | both | `"workDays"` added to `WORKFLOW_ORDER_VIEW_FIELDS_BEFORE_LEAK_FIX` (+1/−1); the leak fix's hidden-field filter and scrub still apply after it |

The first A/B trees (14 Oct, built on 00133/00020) predate the workflow view leak fix and are kept only as
`SUPERSEDED-*-pre-leak-DO-NOT-DEPLOY`: deploying them would reopen the leak.

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

## 7. 15 Oct 2026 — owner's six requirements (date picker, no conversion, two measures, boundaries, permissions, history)

Branches: web `working-day2-web-2026-10-15` (on live `ffe0d065`), native + server source `working-day2-native-2026-10-15`
(on candidate `99d71a18`). Server deploy tree: `~/Developer/nivadesk-deploy-2026-10-15/working-day2/A` (live
`updateWebOrder` 00136-vab archive + this change). Optional rules package: `.../working-day2/R`. Nothing pushed or deployed.

**1. Date picker.** All three clients already had one; it now stops at **today on the device** (web `max=today`, iOS
`...Date()`, Android `SelectableDates` ≤ today; the server still accepts up to tomorrow UTC so UTC+14 can log its today).
Past dates are picked freely. Edit: an entry's **kind and note** can be edited (date and member stay — to move a day,
delete it and log the right date). Saving the same day again still **replaces** (one entry per member per day).

**2. No conversion.** Verified across web, iOS/macOS, Android, live `updateWebOrder`, `exportOrders`, `chatgptMcp`, the
finance engine, PDF/CSV export and backups: nothing turns a day entry into hours or money and nothing adds days to the
timer. Timer hours do not reach money either. The full web JSON backup copies `workDays` as stored; the MCP passes the
last 20 order-history lines, which can include "Work day logged · 2026-10-14 · Full day" (no hours, no money).
Each client's tests and the server test assert the modules contain no hours/money arithmetic.

**3. Two measures, never added.** The card shows two separate figures: **Timer total** (hours, from sessions) and
**Days worked** (1 / 0.5 per entry), with "Timer hours and day entries are counted separately and never added
together." Lists are headed **Day entries** and **Timer sessions**. When the same member also ran the timer on that
day, the entry shows **Timer on this day: 2h 0m** — information only, never summed. No combined total is stored.

**4. Midnight / time zone.** There is no workspace time zone. `date` is the **calendar day of the device that logged
it**, stored as `YYYY-MM-DD` and never converted: Kiritimati (UTC+14) at 00:30 on the 17th stores the 17th; a UTC-12
device at 22:30 on the 15th stores the 15th; London at 23:59:59 stores that day and at 00:00 the next. Other devices
show the stored string as is. "Timer on this day" maps a session's start to the **viewer's** local day, so near
midnight two viewers in different zones may see a different hint (never a different count). History times are shown in
the viewer's local time. Web: the form's default date is set when the card opens (a tab left open over midnight keeps
yesterday until a save or reload resets it); the date limit is recomputed every render.

**5. Permissions — implemented (owner's proposal).**

| Day entries | Owner | Admin | Member | Workflow Only (assigned orders) | Assigned-projects-only | View only |
|---|---|---|---|---|---|---|
| Log own day | yes (=) | yes (=) | yes (=) | yes (=) | yes, own orders (=) | no (=) |
| Change / delete own entry | yes (=) | yes (=) | yes (=) | yes (=) | yes (=) | no (=) |
| Change someone else's entry (kind, note) | **yes** (was: no) | no (=) | no (=) | no (=) | no (=) | no (=) |
| Delete someone else's entry | yes (=) | **no** (was: yes) | no (=) | no (=) | no (=) | no (=) |
| Log a NEW day for someone else | no (=) | no (=) | no (=) | no (=) | no (=) | no (=) |
| Direct Firestore write of `workDays` / `workDayHistory` | today possible; **no** with package R | same | same | not possible (=) | today possible on own order; **no** with R | no (=) |

"Owner" = the workspace owner (`uidIsCompanyOwner`), not a custom role. The owner's correction keeps the entry the
member's (member, e-mail, created date) and stamps `updatedByUid/Email`; the card shows **Changed by** on it.
Timer rules are **not** changed: anyone who may edit Work Time can stop or delete any session. Making the timer match
would need the Apple apps to stop writing `workSessions` with the whole order (they write the array directly on paid
plans), so it is not a trivial change — decision for the owner.

**6. History.** Every change through `updateWebOrder` adds a row to the new server-only array `workDayHistory` (newest
first, at most 500): `{id, at, action: logged|changed|deleted, entryId, date, memberUid, memberEmail, byUid, byEmail,
before:{kind,note}|null, after:{kind,note}|null, source}`; the order's general history line also names whose entry it
was when someone else changed it. Entries saved before this have **no** rows and no `updatedBy` stamp — nothing is made
up. The card shows "Day entry history (n)". Workflow Only members do not get the array (their view is unchanged); they
see "Changed by" on their own entries through `workDays`.

**Deploy.** Server first (tree A, `updateWebOrder` only; the views already carry `workDays` and need no change), then
web, then native. A live client without this change keeps working (the server stays compatible: same patch, plus the
optional `memberUid` on set). Old web/native clients still offer admins a delete button for others' entries; the
server now answers "You can delete only your own day entries." Optional R (rules) after the clients: live 05dd212c +
2 conditions.

**Verification (15 Oct 2026).**
- Server: `functions/test/qa/work-days.test.js` 24/24 on tree A (11 red on the live archive); callable e2e on the
  functions emulator 33/33 on tree A, 21/33 on the live archive (admin deleting a member's entry is accepted there).
  Tree A: `patch -R` = live 00136 archive byte for byte; discovery manifest 415 endpoints identical to the live
  archive's, `updateWebOrder` unchanged (callable, europe-west2, no secrets); all 40 declared secrets exist.
- Rules R: 24/24 (live 05dd212c: 15/24 — direct writes of both fields accepted today).
- Web: `test:work-days` 429/429 (live code: 34 of 273 red), tsc 0, `next build` 0 (same pre-existing CSS warning);
  the other `test:*`: 31 green, 11 red — the same 11 are red on live `ffe0d065` (8 × missing
  notesSharingTranslations in their transpile list, customer-card, team-schedule-key, finance).
- Android: `testDebugUnitTest` 473/0 (WorkDaysTest 13/13), `assembleDebug` OK. iOS: the real `WorkDays.swift`
  compiled with a stub check 23/23 (the candidate's file does not compile against it); iOS QA build and macOS build
  BUILD SUCCEEDED, 0 errors (macOS .app removed after the build).
- Isolated acceptance `demo-nivadesk-wd15` (auth 9861, firestore 8861, functions 5861, storage 9863), tree A in the
  functions emulator, live rules text, heartbeat OFF (Android launcher read it; iOS QA build has it compiled off):
  web owner corrected a member's entry (Half day + note → `updatedByUid` owner, history row, order history names the
  member) and logged 10 Oct with the date picker; web admin sees no Edit/Delete on others, logs/re-saves own (one
  entry); web member sees "Changed by", Edit/Delete only on own; iPhone member edited own entry (source ios); Android
  member2 edited own (source android) and logged 12 Oct with the picker (16 Oct not selectable); iPhone owner deleted
  that Android entry (history: deleted by owner, ios) and logged 6 Oct with the picker (16 Oct disabled). Each step
  read back from Firestore. Timer total stayed 2h 0m (7200 s) throughout while days went 1.5 → 4.5 (5 entries, 11 history rows).
