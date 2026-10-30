// Calendar V1: what the /calendar screen shows (lib/studioflow/calendarView.ts) — the acceptance points
// that live in the screen logic. Run: npx tsx scripts/check-calendar-view.mts
import * as core from "../lib/studioflow/calendarCore.ts";
import * as v from "../lib/studioflow/calendarView.ts";

let pass = 0;
const fails: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass += 1;
  else fails.push(`${name}${detail ? `: ${detail}` : ""}`);
}
const E = (id: string, raw: Record<string, unknown>) => core.normalizeEntry(id, { ownerUid: "me", accessUids: ["me"], visibility: "private", timeZone: "Europe/London", allDay: true, ...raw }) as core.CalendarEntry;
const build = (over: Partial<v.BuildInput>) => v.buildCalendarItems({ entries: [], orders: [], notes: [], uid: "me", fromKey: "2026-10-19", toKey: "2026-11-01", viewerTimeZone: "Europe/London", todayKey: "2026-10-28", ...over });

// Order due: one card, from the order itself; date change moves it, never two; not a "done" event.
const order = { id: "o1", title: "Oak frame", customerName: "Ana", paymentDate: new Date(2026, 9, 1, 15, 30), deliveryTime: 25, isDelivered: false };
let items = build({ orders: [order] });
const due = items.filter((i) => i.kind === "orderDue");
check("order due shows once", due.length === 1, JSON.stringify(due.map((d) => d.days)));
check("order due day = start day + deliveryTime", due[0]?.days[0] === "2026-10-26", due[0]?.days[0]);
check("order card is read-only and has no task state", Boolean(due[0]?.readOnly) && due[0]?.taskState === null);
items = build({ orders: [{ ...order, deliveryTime: 28 }] });
const moved = items.filter((i) => i.kind === "orderDue");
check("changed target date moves the single card", moved.length === 1 && moved[0].days[0] === "2026-10-29", JSON.stringify(moved.map((d) => d.days)));
check("old target day is empty after the change", !items.some((i) => i.days.includes("2026-10-26")));
check("deliveryTime 0 = no due card", build({ orders: [{ ...order, deliveryTime: 0 }] }).length === 0);
check("order outside range shows nothing", build({ orders: [{ ...order, deliveryTime: 90 }] }).length === 0);

// Note written for last week: own date, found by search, the item keeps its date.
const note = E("n1", { type: "note", title: "", description: "Delivered the walnut table\nCustomer happy", dateKey: "2026-10-21", createdAt: Date.parse("2026-10-28T10:00:00Z") });
items = build({ entries: [note] });
check("past note sits on its own date", items.length === 1 && items[0].days[0] === "2026-10-21");
check("note gets its first line as title", items[0]?.title === "Delivered the walnut table", items[0]?.title);
check("search finds the past note by its text", v.searchCalendarItems(items, "customer HAPPY").length === 1);
check("search ignores accents/case", v.searchCalendarItems(build({ entries: [E("n2", { type: "note", description: "Çay ısmarladım", dateKey: "2026-10-21" })] }), "cay").length === 1);
check("search with no hit is empty", v.searchCalendarItems(items, "nothing like this").length === 0);

// Last week's task done today: planned day kept, also listed on the completion day as the same record.
const task = E("t1", { type: "task", title: "Sand frames", dateKey: "2026-10-20", status: "done", completedAt: Date.parse("2026-10-28T11:00:00Z"), completedByUid: "me" });
items = build({ entries: [task] });
check("done task stays on its planned day", items.length === 1 && items[0].days[0] === "2026-10-20");
check("done task knows its completion day", items[0]?.completedDay === "2026-10-28", String(items[0]?.completedDay));
const byDay = v.itemsByDay(items, "2026-10-19", "2026-11-01");
check("completion day lists the same task, marked as completion", byDay.get("2026-10-28")?.length === 1 && byDay.get("2026-10-28")?.[0].asCompletion === true && byDay.get("2026-10-28")?.[0].item.id === "t1");
check("planned day lists it once, not as completion", byDay.get("2026-10-20")?.length === 1 && byDay.get("2026-10-20")?.[0].asCompletion === false);
check("done task is not late", items[0]?.taskState === "done");
const openLate = build({ entries: [E("t2", { type: "task", title: "Call", dateKey: "2026-10-20" })] });
check("open task from last week is late", openLate[0]?.taskState === "late");
const cancelled = build({ entries: [E("t3", { type: "task", title: "Call", dateKey: "2026-10-20", status: "cancelled" })] });
check("cancelled task is never late", cancelled[0]?.taskState === "cancelled");
const doneOutside = v.buildCalendarItems({ entries: [task], orders: [], notes: [], uid: "me", fromKey: "2026-10-26", toKey: "2026-11-01", viewerTimeZone: "Europe/London", todayKey: "2026-10-28" });
check("a range holding only the completion day still finds the task", doneOutside.length === 1 && doneOutside[0].days.length === 0 && doneOutside[0].completedDay === "2026-10-28");

// Run 3: no 64-day limit. Tasks planned 65, 180 and 400 days before today, done today, show today; planned day kept.
const today = "2026-10-29";
const doneToday = Date.parse("2026-10-29T10:00:00Z");
// Day view (today only): the old 64-day window was counted from the range start, so this is where 65 days fell out.
const week = (entries: core.CalendarEntry[]) => v.buildCalendarItems({ entries, orders: [], notes: [], uid: "me", fromKey: today, toKey: today, viewerTimeZone: "Europe/London", todayKey: today });
for (const back of [65, 180, 400]) {
  const planned = core.addDays(today, -back);
  const old = E(`old${back}`, { type: "task", title: `Planned ${back} days ago`, dateKey: planned, status: "done", completedAt: doneToday, completedByUid: "me" });
  const got = week([old]);
  const rows = v.itemsByDay(got, today, today).get(today) || [];
  check(`task planned ${back} days ago, done today: listed today as a completion`, got.length === 1 && rows.length === 1 && rows[0].asCompletion && rows[0].item.occurrence?.dateKey === planned, JSON.stringify(got.map((i) => [i.days, i.completedDay])));
  const reopened = E(`old${back}r`, { type: "task", title: "Reopened", dateKey: planned, status: "open" });
  check(`task planned ${back} days ago, reopened: not listed today`, week([reopened]).length === 0);
}
const oldDaily = E("od", { rowType: "series", type: "task", title: "Daily check", dateKey: "2025-09-01", recurrence: { freq: "daily" },
  occurrenceStatus: { "2025-09-24": { status: "done", completedAt: doneToday, completedByUid: "me" }, "2026-04-29": { status: "open", completedAt: null, completedByUid: null } } });
const odItems = week([oldDaily]);
const odDone = odItems.filter((i) => i.completedDay === today);
check("series occurrence planned 400 days ago, done today: that one listed today", odDone.length === 1 && odDone[0].occurrence?.occurrenceKey === "2025-09-24", JSON.stringify(odDone.map((i) => i.occurrence?.occurrenceKey)));
check("series: the reopened old occurrence is not listed, today's is", !odItems.some((i) => i.occurrence?.occurrenceKey === "2026-04-29") && odItems.filter((i) => i.days.length).length === 1, String(odItems.length));
const cancelledOld = E("co", { rowType: "series", type: "task", title: "Weekly", dateKey: "2025-09-02", recurrence: { freq: "weekly", byWeekday: [2] },
  exceptions: { "2025-09-23": { cancelled: true } }, occurrenceStatus: { "2025-09-23": { status: "done", completedAt: doneToday, completedByUid: "me" } } });
check("series: a cancelled old occurrence is never shown as done", !week([cancelledOld]).some((i) => i.completedDay === today));

// Repeating task: completing one occurrence leaves the others open.
const daily = E("d1", { rowType: "series", type: "task", title: "Water", dateKey: "2026-10-26", recurrence: { freq: "daily", count: 5 }, occurrenceStatus: { "2026-10-27": { status: "done", completedAt: Date.parse("2026-10-27T09:00:00Z"), completedByUid: "me" } } });
items = build({ entries: [daily] });
check("series gives five occurrences", items.length === 5, String(items.length));
check("only the 27th is done", items.filter((i) => i.taskState === "done").map((i) => i.occurrence?.occurrenceKey).join() === "2026-10-27");
check("the 26th is late, later ones open", items.find((i) => i.occurrence?.occurrenceKey === "2026-10-26")?.taskState === "late" && items.find((i) => i.occurrence?.occurrenceKey === "2026-10-29")?.taskState === "open");

// Note reminders: own notes only (the caller passes only the person's own collection); archived/deleted not.
items = build({ notes: [{ id: "k1", title: "Pay VAT", text: "", reminderMs: Date.parse("2026-10-30T09:00:00Z") }, { id: "k2", title: "Old", text: "", reminderMs: Date.parse("2026-10-30T09:00:00Z"), isArchived: true }] });
check("note reminder shows on its day, archived does not", items.length === 1 && items[0].kind === "noteReminder" && items[0].days[0] === "2026-10-30");

// Scope and filters (they hide, never grant).
const mine = E("m1", { title: "Mine", dateKey: "2026-10-22" });
const shared = E("s1", { ownerUid: "boss", accessUids: ["boss", "me"], visibility: "selected", title: "Shared", dateKey: "2026-10-22" });
const team = E("w1", { ownerUid: "boss", accessUids: ["boss"], visibility: "workspace", title: "Team", dateKey: "2026-10-22", orderId: "o1" });
const labelled = E("l1", { type: "workday", title: "Work", personLabel: "Yunseo", dateKey: "2026-10-23" });
items = build({ entries: [mine, shared, team, labelled] });
check("scopes are mine/shared/team", items.map((i) => `${i.id}:${i.scope}`).sort().join() === "l1:mine,m1:mine,s1:shared,w1:team");
check("filter: only shared", v.applyCalendarFilters(items, { ...v.DEFAULT_CALENDAR_FILTERS, mine: false, team: false }).map((i) => i.id).join() === "s1");
check("filter: linked to an order", v.applyCalendarFilters(items, { ...v.DEFAULT_CALENDAR_FILTERS, orderLink: "linked" }).map((i) => i.id).join() === "w1");
check("filter: name label", v.applyCalendarFilters(items, { ...v.DEFAULT_CALENDAR_FILTERS, person: "label:yunseo" }).map((i) => i.id).join() === "l1");
check("filter: type", v.applyCalendarFilters(items, { ...v.DEFAULT_CALENDAR_FILTERS, types: ["workday"] }).map((i) => i.id).join() === "l1");
check("default filters show everything", v.applyCalendarFilters(items, v.DEFAULT_CALENDAR_FILTERS).length === 4 && !v.filtersActive(v.DEFAULT_CALENDAR_FILTERS));

// Timed entry from Istanbul seen in London lands on the right local day; all-day never shifts.
const ist = E("i1", { title: "Supplier", allDay: false, startTime: "00:30", endTime: "01:00", timeZone: "Europe/Istanbul", dateKey: "2026-10-23" });
items = build({ entries: [ist] });
check("00:30 Istanbul is 22:30 the day before in London", items[0]?.days.join() === "2026-10-22", items[0]?.days.join());
items = build({ entries: [E("a1", { title: "Fair", dateKey: "2026-10-23" })], viewerTimeZone: "Pacific/Auckland" });
check("all-day stays on its date in any zone", items[0]?.days.join() === "2026-10-23");

// View ranges: Monday weeks, month grid, agenda 30 days.
check("week range Monday-first", JSON.stringify(v.rangeFor("week", "2026-10-29")) === JSON.stringify({ fromKey: "2026-10-26", toKey: "2026-11-01" }));
check("month grid covers whole weeks", JSON.stringify(v.rangeFor("month", "2026-11-17")) === JSON.stringify({ fromKey: "2026-10-26", toKey: "2026-12-06" }));
check("agenda 30 days", v.rangeFor("agenda", "2026-10-29").toKey === "2026-11-27");
check("month shift clamps day", v.monthShift("2026-01-31", 1) === "2026-02-28" && v.shiftAnchor("month", "2026-12-15", 1) === "2027-01-15");

// V1.1: overdue tasks for the Today view — one row per entry, earliest missed day, how many times; done/cancelled/today excluded.
{
  const today = "2026-10-29";
  const from = core.addDays(today, -v.OVERDUE_WINDOW_DAYS);
  const late1 = E("od1", { type: "task", title: "Call supplier", dateKey: "2026-10-27" });
  const done1 = E("od2", { type: "task", title: "Done one", dateKey: "2026-10-26", status: "done", completedAt: 1793185200000, completedByUid: "me" });
  const todayTask = E("od3", { type: "task", title: "Today's", dateKey: today });
  const daily = E("od4", { rowType: "series", type: "task", title: "Water plants", dateKey: "2026-10-26", recurrence: { freq: "daily", interval: 1, byWeekday: [], untilKey: null, count: null },
    occurrenceStatus: { "2026-10-27": { status: "done", completedAt: 1793091600000, completedByUid: "me" } } });
  const meeting = E("od5", { title: "Old meeting", dateKey: "2026-10-27" });
  const its = v.buildCalendarItems({ entries: [late1, done1, todayTask, daily, meeting], orders: [], notes: [], uid: "me", fromKey: from, toKey: core.addDays(today, -1), viewerTimeZone: "Europe/London", todayKey: today });
  const od = v.overdueTasks(its, today);
  check("overdue: one row per entry, done/today/meetings left out", od.map((r) => r.item.entry?.id).join() === "od4,od1", od.map((r) => `${r.item.entry?.id}:${r.sinceKey}:${r.count}`).join());
  check("overdue: a daily task missed on 26 and 28 Oct shows once since 26 Oct, 2 times", od[0]?.sinceKey === "2026-10-26" && od[0]?.count === 2, JSON.stringify(od[0] && { s: od[0].sinceKey, c: od[0].count }));
  check("overdue: a one-off task shows since its day", od[1]?.sinceKey === "2026-10-27" && od[1]?.count === 1);
}
// V1.1: remembered filters are read back defensively.
check("filters: a saved choice is read back", JSON.stringify(v.parseCalendarFilters({ mine: false, shared: true, team: true, person: "uid:x", types: ["task"], status: "late", orderLink: "linked" })) === JSON.stringify({ mine: false, shared: true, team: true, person: "uid:x", types: ["task"], status: "late", orderLink: "linked" }));
check("filters: junk falls back to the defaults", JSON.stringify(v.parseCalendarFilters({ mine: "no", types: ["bogus"], status: "weird", orderLink: 3 })) === JSON.stringify(v.DEFAULT_CALENDAR_FILTERS));
check("filters: nothing saved = defaults", JSON.stringify(v.parseCalendarFilters(null)) === JSON.stringify(v.DEFAULT_CALENDAR_FILTERS));

// V1.1: meetings from the person's own Google / Outlook calendar — read only, placed in the viewer's zone.
{
  const ext = (id: string, raw: Partial<v.CalendarExternalLike>): v.CalendarExternalLike => ({ id, provider: "google", calendarName: "Mem", title: id, location: "", joinUrl: "", openUrl: "https://calendar.google.com/x", allDay: false, dateKey: "", endDateKey: "", startMs: null, endMs: null, recurring: false, ...raw });
  const its = v.buildCalendarItems({ entries: [], orders: [], notes: [], uid: "me", fromKey: "2026-10-19", toKey: "2026-11-01", viewerTimeZone: "Europe/London", todayKey: "2026-10-28",
    externals: [
      ext("late-call", { startMs: Date.parse("2026-10-21T22:00:00Z"), endMs: Date.parse("2026-10-21T22:45:00Z") }),  // 23:00–23:45 BST, 21 Oct
      ext("midnight", { startMs: Date.parse("2026-10-21T22:30:00Z"), endMs: Date.parse("2026-10-21T23:30:00Z") }),   // 23:30–00:30 BST: two days
      ext("ny", { startMs: Date.parse("2026-10-27T01:00:00Z"), endMs: Date.parse("2026-10-27T02:00:00Z") }),            // 01:00 GMT 27 Oct
      ext("fair", { allDay: true, dateKey: "2026-10-31", endDateKey: "2026-11-02" }),
      ext("outside", { startMs: Date.parse("2026-12-01T10:00:00Z"), endMs: Date.parse("2026-12-01T11:00:00Z") }),
    ] });
  const byId = Object.fromEntries(its.map((i) => [i.id, i]));
  check("external: timed meetings land on the viewer's local day", byId["ext:late-call"]?.days.join() === "2026-10-21" && byId["ext:ny"]?.days.join() === "2026-10-27");
  check("external: a meeting running past midnight shows on both days", byId["ext:midnight"]?.days.join() === "2026-10-21,2026-10-22");
  check("external: an all-day event keeps its dates, clipped to the range", byId["ext:fair"]?.days.join() === "2026-10-31,2026-11-01");
  check("external: outside the range is left out", !byId["ext:outside"]);
  check("external: read only, never a task, mine, carries its source", its.filter((i) => i.kind === "external").every((i) => i.readOnly && !i.taskState && i.scope === "mine" && i.external?.provider === "google"));
  check("external: Tokyo viewer sees the London 23:30 call on the next day", v.externalDays(ext("t", { startMs: Date.parse("2026-10-21T22:30:00Z"), endMs: Date.parse("2026-10-21T23:30:00Z") }), "2026-10-19", "2026-11-01", "Asia/Tokyo").join() === "2026-10-22");
  check("external: the type filter can pick them", v.applyCalendarFilters(its, { ...v.DEFAULT_CALENDAR_FILTERS, types: ["external"] }).length === 4);
  check("filters: a saved external type is read back", JSON.stringify(v.parseCalendarFilters({ types: ["external"] }).types) === JSON.stringify(["external"]));
}

for (const f of fails) console.log(`FAIL ${f}`);
console.log(`calendar view (web): ${pass}/${pass + fails.length} pass${fails.length ? "" : "; reds: none"}`);
process.exit(fails.length ? 1 : 0);
