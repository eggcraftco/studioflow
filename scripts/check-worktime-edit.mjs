// worktime-edit (23 Oct 2026): owner/admin correct and delete Work Time timer rows on the web.
//   1. lib/studioflow/workSessionCorrections.ts, run for real: the role gate (owner/admin only), who may delete,
//      the server's checks (end after start, nothing in the future, 7-day cap, 12-hour warning), the audit
//      mapping and the datetime-local round trip;
//   2. the card offers correction and deletion only through those gates, asks before deleting, warns on a long
//      session, and writes only through updateWebOrder's workTime patch (no Firestore write of workSessionAudit);
//   3. the order model reads `workSessionAudit`;
//   4. every new string is translated in all eleven languages (compiled studioT).
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const failures = [];
let checks = 0;
const check = (label, ok) => { checks += 1; if (!ok) failures.push(label); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "worktime-edit-"));
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText
  .replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"');

// 1. The pure module.
const modulePath = "lib/studioflow/workSessionCorrections.ts";
const hasModule = fs.existsSync(path.join(root, modulePath));
check("workSessionCorrections.ts exists", hasModule);
if (hasModule) {
  fs.writeFileSync(path.join(tmp, "wsc.mjs"), transpile(read(modulePath)));
  const m = await import(pathToFileURL(path.join(tmp, "wsc.mjs")).href);
  for (const role of ["owner", "admin", "Owner", " ADMIN "]) check(`role ${role} corrects`, m.canCorrectWorkTimeForRole(role) === true);
  for (const role of ["member", "workflow", "viewer", "view_only", "", "unknown"]) check(`role ${role || "(none)"} does not correct`, m.canCorrectWorkTimeForRole(role) === false);
  const audit = m.mapWorkSessionAudit([
    { id: "a1", sessionId: "s1", action: "closed", at: { seconds: 100 }, byUid: "o", byEmail: "o@x", memberUid: "m", before: { startedAt: { seconds: 10 }, endedAt: null, durationSeconds: 0 }, after: { startedAt: { seconds: 10 }, endedAt: { seconds: 70 }, durationSeconds: 60 } },
    { id: "a2", sessionId: "s2", action: "deleted", before: { startedAt: { seconds: 1 }, endedAt: { seconds: 2 }, durationSeconds: 1 }, after: null },
    { id: "bad", sessionId: "", action: "edited" },
    { id: "bad2", sessionId: "s3", action: "hacked" },
    "nonsense"
  ]);
  check("audit: malformed rows dropped", audit.length === 2);
  check("audit: dates read from {seconds}", audit[0].at instanceof Date && audit[0].at.getTime() === 100000 && audit[0].after.endedAt.getTime() === 70000);
  check("audit: deletion has no after", audit[1].after === null);
  check("latestCorrection ignores deletions", m.latestCorrection(audit, "s1")?.id === "a1" && m.latestCorrection(audit, "s2") === null);
  check("original values = first before", m.originalValues(audit, "s1")?.endedAt === null);
  const mine = { id: "s9", createdByUid: "me" };
  check("owner/admin delete any row", m.canDeleteWorkSession({ id: "x", createdByUid: "other" }, "me", true, audit));
  check("member deletes own uncorrected row", m.canDeleteWorkSession(mine, "me", false, audit));
  check("member cannot delete someone else's row", !m.canDeleteWorkSession({ id: "x", createdByUid: "other" }, "me", false, audit));
  check("member cannot delete an own corrected row", !m.canDeleteWorkSession({ id: "s1", createdByUid: "me" }, "me", false, audit));
  check("member cannot delete an ownerless (legacy) row", !m.canDeleteWorkSession({ id: "x", createdByUid: "" }, "", false, audit));
  const now = new Date("2026-10-23T18:00:00Z");
  const h = (n) => new Date(now.getTime() + n * 3600000);
  check("end before start refused", m.checkCorrection(h(-2), h(-3), false, now).error === "The end time must be after the start time.");
  check("equal start/end refused", m.checkCorrection(h(-2), h(-2), false, now).ok === false);
  check("end in the future refused", m.checkCorrection(h(-2), h(1), false, now).error === "The end time cannot be in the future.");
  check("start in the future refused", m.checkCorrection(h(1), null, true, now).error === "The start time cannot be in the future.");
  check("over 7 days refused", m.checkCorrection(h(-200), h(-1), false, now).error === "A work session cannot be longer than 7 days.");
  check("finished row needs an end", m.checkCorrection(h(-2), null, false, now).error === "A finished work session needs an end time.");
  check("running row may keep running", m.checkCorrection(h(-2), null, true, now).ok === true);
  check("13 h asks first", m.checkCorrection(h(-14), h(-1), false, now).long === true);
  check("4 h does not ask", m.checkCorrection(h(-5), h(-1), false, now).long === false);
  const local = new Date(2026, 9, 23, 9, 5, 42);
  check("datetime-local value", m.dateTimeLocalValue(local) === "2026-10-23T09:05");
  check("datetime-local parse keeps seconds when unchanged", m.parseDateTimeLocal("2026-10-23T09:05", local) === local);
  check("datetime-local parse local time", m.parseDateTimeLocal("2026-10-23T10:30").getHours() === 10);
  check("empty end = null", m.parseDateTimeLocal("") === null);
}

// 2. The card.
const detail = read("app/orders/OrderDetailContent.tsx");
check("correction gate = canEditWorkTime && owner/admin", detail.includes("canCorrectWorkTime = Boolean(canEditWorkTime && canCorrectWorkTimeForRole(normalizeWorkspaceRole(workspace.role)))"));
check("correct button only for owner/admin", /\{canCorrectWorkTime \? \(\s*<button[\s\S]{0,600}work-session-correct-/.test(detail));
check("running banner offers correction to owner/admin", detail.includes('data-testid="work-active-correct"'));
check("delete button gated by canDeleteWorkSession", detail.includes("const mayDelete = canDeleteWorkSession(session, myUid, canCorrectWorkTime, workSessionAudit);") && detail.includes("{mayDelete ? ("));
check("delete asks first", detail.includes('window.confirm(t("Delete this work session? It will be removed from the totals."))'));
check("long session asks first", detail.includes('window.confirm(t("This session is longer than 12 hours. Save anyway?"))'));
check("correction goes through the workTime patch", detail.includes('{ action: "edit", sessionId: session.id, startedAt: start!.toISOString() }') && detail.includes("void saveWorkTimePatch(patch, \"Correct\")"));
check("no direct Firestore write of timer rows or their audit from the card", !/(setDoc|updateDoc)\([^;]*workSession/.test(detail));
check("corrected mark shown", detail.includes("work-session-corrected-") && detail.includes('t("Corrected by")'));
check("corrections history shown", detail.includes('data-testid="work-session-audit"'));
check("pending edit resolves on the server's values", detail.includes('pending.action === "edit"'));
const orders = read("lib/studioflow/orders.ts");
check("workTime patch type has edit + times", orders.includes('"start" | "continue" | "stop" | "delete" | "edit"') && orders.includes("endedAt?: string | null;"));

// 3. Model.
const firestore = read("lib/studioflow/firestore.ts");
check("order model reads workSessionAudit", firestore.includes("workSessionAudit: mapWorkSessionAudit(data.workSessionAudit)"));

// 4. Translations.
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português",
  "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const DICTIONARY_FILES = ["language", ...[...read("lib/studioflow/language.ts").matchAll(/from "\.\/(\w+)"/g)].map((m) => m[1])];
for (const name of DICTIONARY_FILES) fs.writeFileSync(path.join(tmp, `${name}.mjs`), transpile(read(`lib/studioflow/${name}.ts`)));
const { studioT } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
const KEYS = ["Correct time", "Correct work time", "Start time", "End time", "Leave End time empty to keep the timer running.", "Save time", "Corrected by", "Original",
  "Work time corrected.", "Work timer closed.", "Work time corrected", "Work timer closed", "Work time corrections", "Time corrected", "Timer closed", "Session deleted",
  "Delete this work session? It will be removed from the totals.", "This session is longer than 12 hours. Save anyway?",
  "Only the workspace owner or an admin can correct work time.", "Only the workspace owner or an admin can delete someone else's work session.",
  "This work session was corrected by the workspace owner or an admin and only they can delete it.", "The end time must be after the start time.",
  "The end time cannot be in the future.", "The start time cannot be in the future.", "A work session cannot be longer than 7 days.", "Enter a valid start time.",
  "Enter a valid end time.", "A finished work session needs an end time.", "Work session not found.", "Could not update Work Time."];
for (const key of KEYS) {
  check(`English: ${key}`, studioT(key, "English") === key);
  for (const language of LANGUAGES) {
    const out = studioT(key, language);
    check(`studioT(${JSON.stringify(key)}, ${language}) translated`, Boolean(out) && out !== key);
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(`check-worktime-edit: ${failures.length} of ${checks} FAILED`);
  for (const f of failures.slice(0, 40)) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-worktime-edit: ${checks}/${checks} passed`);
