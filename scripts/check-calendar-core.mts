// Calendar V1: the web core (lib/studioflow/calendarCore.ts) against the shared vectors
// (scripts/calendar/calendar-vectors.json — built from functions/calendar/calendarCore.js; the
// Swift and Kotlin ports run the same file). Run: npx tsx scripts/check-calendar-core.mts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as c from "../lib/studioflow/calendarCore.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const v = JSON.parse(fs.readFileSync(path.join(here, "calendar", "calendar-vectors.json"), "utf8"));
let pass = 0;
const fails: string[] = [];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function check(name: string, actual: unknown, wanted: unknown) {
  if (same(actual, wanted)) pass += 1;
  else fails.push(`${name}: got ${JSON.stringify(actual)} wanted ${JSON.stringify(wanted)}`);
}
const entry = (id: string, raw: unknown) => c.normalizeEntry(id, raw) as c.CalendarEntry;
const byId = (id: string) => entry(id, v.expand.find((x: { id: string }) => x.id === id).raw);

for (const z of v.zoned) check(`zoned ${z.dateKey} ${z.time} ${z.timeZone}`, c.zonedTimeToUtcMs(z.dateKey, z.time, z.timeZone), z.utcMs);
for (const l of v.local) {
  const p = c.localParts(l.ms, l.timeZone);
  check(`local ${l.ms} ${l.timeZone}`, [p.dateKey, p.time, c.offsetMinutes(l.ms, l.timeZone)], [l.dateKey, l.time, l.offsetMinutes]);
}
for (const w of v.weekday) check(`weekday ${w.dateKey}`, [c.isoWeekday(w.dateKey), c.addDays(w.dateKey, 40), c.addDays(w.dateKey, -400), c.startOfWeek(w.dateKey, 1)], [w.isoWeekday, w.plus40, w.minus400, w.weekStartMonday]);
for (const x of v.expand) {
  const got = c.expandEntry(entry(x.id, x.raw), x.from, x.to).map((o) => ({ occurrenceId: o.occurrenceId, occurrenceKey: o.occurrenceKey, dateKey: o.dateKey, endDateKey: o.endDateKey, allDay: o.allDay, startTime: o.startTime, endTime: o.endTime, startMs: o.startMs, endMs: o.endMs, title: o.title, status: o.status, completedAtMs: o.completedAtMs, moved: o.moved }));
  check(`expand ${x.name}`, got, x.occurrences);
}
for (const d of v.days) {
  const occ = c.expandEntry(byId(d.id), "2026-10-01", "2026-12-31").find((o) => o.occurrenceId === d.occurrenceId);
  check(`days ${d.id} in ${d.viewerTimeZone}`, occ ? c.occurrenceDays(occ, d.viewerTimeZone) : null, d.days);
}
for (const a of v.access) check(`access ${a.name}`, c.entryAccess(entry("x", a.raw), a.uid, a.member), a.access);
for (const s of v.sharing) check(`sharing ${JSON.stringify(s.input)}`, c.sharingFor(s.input), s.result);
for (const d of v.validate) check(`validate ${JSON.stringify(d.draft)}`, c.validateDraft(d.draft), d.errors);
for (const n of v.noteTitle) check(`noteTitle ${JSON.stringify(n.text).slice(0, 30)}`, c.autoNoteTitle(n.text), n.title);
for (const n of v.next) check(`next ${n.name}`, c.nextReminder(byId(n.id), c.normalizeReminder(n.reminder), n.afterMs), n.next);
for (const d of v.decision) check(`decision ${d.name}`, c.reminderDecision(byId(d.id), c.normalizeReminder(d.reminder) as c.CalendarReminder, d.key, d.fireMs, d.nowMs), d.decision);
for (const s of v.split) check(`split ${s.name}`, c.splitSeries(entry(s.id, s.raw), s.key, s.changes), s.result);
for (const e of v.endBefore) check(`endBefore ${e.id} ${e.key}`, c.endSeriesBefore(entry(e.id, e.raw), e.key), e.result);
for (const t of v.taskState) check(`taskState ${JSON.stringify(t.occurrence)}`, c.taskState(t.occurrence, t.todayKey), t.state);

for (const f of fails) console.log(`FAIL ${f}`);
console.log(`calendar core (web): ${pass}/${pass + fails.length} pass${fails.length ? "" : "; reds: none"}`);
process.exit(fails.length ? 1 : 0);
