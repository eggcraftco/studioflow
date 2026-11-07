// One reminder list (lib/studioflow/reminderCore.ts) against the shared vectors (scripts/reminders/reminder-vectors.json,
// the same file the Swift and Kotlin copies are tested with), plus the screen wiring that must not drift back.
// Run: npx tsx scripts/check-reminder-core.mts
import { readFileSync } from "node:fs";
import * as r from "../lib/studioflow/reminderCore.ts";

let pass = 0;
const fails: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass += 1;
  else fails.push(`${name}${detail ? `: ${detail}` : ""}`);
}

const vectors = JSON.parse(readFileSync(new URL("./reminders/reminder-vectors.json", import.meta.url), "utf8"));
const nowMs: number = vectors.nowMs;

for (const c of vectors.parseOrderDue) check(`parseOrderDue ${c.name}`, r.parseOrderDue(c.raw) === c.ms, `${r.parseOrderDue(c.raw)} != ${c.ms}`);
for (const c of vectors.resolveAllDay) check(`resolveReminderAllDay ${c.name}`, r.resolveReminderAllDay(c.reminderMs, c.mode) === c.allDay, `${r.resolveReminderAllDay(c.reminderMs, c.mode)} != ${c.allDay}`);
for (const c of vectors.allDayStorage) check(`allDayStorageMs ${c.name}`, r.allDayStorageMs(c.dayKey, c.timeZone) === c.ms, `${r.allDayStorageMs(c.dayKey, c.timeZone)} != ${c.ms}`);

const FIELDS = ["key", "kind", "title", "allDay", "dayKey", "time", "overdue", "dueMs", "orderId", "orderLabel"] as const;
for (const c of vectors.build) {
  const got = r.buildReminders({ notes: c.notes, orders: c.orders, calendar: c.calendar, nowMs, viewerTimeZone: c.viewerTimeZone });
  check(`build ${c.name}: count`, got.length === c.expect.length, `${got.map((g) => g.key).join(",")}`);
  c.expect.forEach((want: Record<string, unknown>, i: number) => {
    const have = got[i] as unknown as Record<string, unknown> | undefined;
    for (const f of FIELDS) {
      check(`build ${c.name}: [${i}] ${f}`, have !== undefined && have[f] === want[f], `${have ? JSON.stringify(have[f]) : "missing"} != ${JSON.stringify(want[f])}`);
    }
  });
}

// One bad order item must never hide the good ones (the iPhone used to drop a whole order's alerts).
const mixed = r.orderReminderItems({ id: "o", label: "O", customFields: { [r.ORDER_SCHEDULE_KEY]: JSON.stringify([{ title: "ok", dueAt: 815826600 }, { title: 42 }, null, "x"]) } }, nowMs, "Europe/London");
check("one bad item keeps the good one", mixed.length === 1 && mixed[0].title === "ok", JSON.stringify(mixed.map((m) => m.title)));
// The order card reads only its own reminders.
const all = r.buildReminders({ nowMs, viewerTimeZone: "Europe/London", notes: [{ id: "n", title: "x", text: "", reminderMs: nowMs + 3600000, linkedOrderId: "A" }], orders: [{ id: "A", label: "A", customFields: { [r.ORDER_SCHEDULE_KEY]: JSON.stringify([{ id: "1", title: "a", dueAt: 815826600 }]) } }, { id: "B", label: "B", customFields: { [r.ORDER_SCHEDULE_KEY]: JSON.stringify([{ id: "2", title: "b", dueAt: 815826600 }]) } }] });
check("remindersForOrder keeps the order's own + its linked note", r.remindersForOrder(all, "A").map((i) => i.key).join(",") === "note:n,order:A:1", r.remindersForOrder(all, "A").map((i) => i.key).join(","));
check("order label drops Untitled design", r.orderReminderLabel("Ann", "Untitled design") === "Ann" && r.orderReminderLabel("Ann", "Ring") === "Ann · Ring");
check("all-day / timed reading", r.noteReminderIsAllDay(1794096000000, undefined) && !r.noteReminderIsAllDay(1794096000000, false) && r.noteReminderIsAllDay(1794139200000, true) && !r.noteReminderIsAllDay(1794139200000, undefined));

// Screen wiring (read as text so a later edit that drops a source turns this red).
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const notesPage = src("app/notes/page.tsx");
check("Notes ▸ Reminders is built from the shared list", /buildReminders\(/.test(notesPage));
check("Notes reminder picker takes a time", /type="time"/.test(notesPage) && /reminderAllDay/.test(notesPage) && /allDayStorageMs\(/.test(notesPage));
check("Notes no longer draws reminders as a date only", !/⏰ \{new Date\(note\.reminderDateMillis\)\.toLocaleDateString\(\)\}/.test(notesPage));
check("Notes lists calendar daily notes", /calendarNotes/.test(notesPage));
check("Notes opens a note from ?note=", /searchParams/.test(notesPage) && /get\("note"\)/.test(notesPage));
check("order alert rows are themed (no hard-coded white card)", !/background: "white", border: "1px solid #e7e7e7", borderRadius: 12, padding: "10px 14px"/.test(notesPage));
const view = src("lib/studioflow/calendarView.ts");
check("Calendar builds order reminders", /orderReminder/.test(view) && /orderReminderItems\(/.test(view));
check("Calendar note reminder knows all-day", /noteReminderIsAllDay|noteReminderItem\(/.test(view));
const calPage = src("app/calendar/page.tsx");
check("Calendar opens ?date= / ?entry=", /get\("date"\)/.test(calPage) && /get\("entry"\)/.test(calPage));
const panel = src("app/calendar/CalendarDetailPanel.tsx");
check("Calendar note reminder opens that note", /\/notes\?note=/.test(panel));
check("Calendar order reminder opens its order", /orderReminder/.test(panel));
const order = src("app/orders/OrderDetailContent.tsx");
check("order card lists linked reminders", /remindersForOrder\(/.test(order));
const doc = src("lib/studioflow/noteDocument.ts");
check("note documents read and write reminderMode", /resolveReminderAllDay\(/.test(doc) && /reminderModeFor\(/.test(doc));

if (fails.length) {
  console.error(`check-reminder-core: ${pass} passed, ${fails.length} FAILED`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check-reminder-core: ${pass} passed`);
