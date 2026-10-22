// An Instagram/WhatsApp photo that is "still being checked" appears by itself
// when the virus check finishes — no reload (22 Oct 2026).
//
// The verdict is server-only and nothing pushes it, so the page must keep
// asking. It used to stop after 8 × 4 s (~32 s); the scanner sleeps when idle
// and may take a minute to wake and up to 300 s to answer, so the first photo
// after a quiet spell stayed a placeholder until the page was reloaded.
//
//   1. lib/studioflow/scanPollSchedule.ts is compiled with the web tree's own
//      TypeScript and run: 4 s at first, backs off, never stops before 300 s,
//      stops after its budget.
//   2. app/inbox/InboxAttachment.tsx uses that schedule (no fixed try count),
//      re-asks on return to the tab/window, pauses while hidden and clears its
//      timer and listeners.
//
//   node scripts/check-inbox-scan-poll.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let passed = 0;
const must = (name, ok) => { if (!ok) failures.push(name); else passed += 1; };

// 1. The schedule, run.
const source = fs.readFileSync(path.join(root, "lib/studioflow/scanPollSchedule.ts"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "scan-poll-")), "scanPollSchedule.mjs");
fs.writeFileSync(tmp, js);
const schedule = await import(pathToFileURL(tmp).href);
const { nextScanPollDelay, SCAN_POLL_BUDGET_MS } = schedule;

must("schedule: budget is at least the scanner's 300 s limit", SCAN_POLL_BUDGET_MS >= 300_000);
must("schedule: the first ask waits 4 s", nextScanPollDelay(0, 1) === 4_000);
must("schedule: still 4 s at 30 s", nextScanPollDelay(30_000, 8) === 4_000);
must("schedule: backs off after the first minute", (nextScanPollDelay(61_000, 16) ?? 0) > 4_000);
must("schedule: 15 s or less late in the round", (nextScanPollDelay(250_000, 30) ?? Infinity) <= 15_000);
must("schedule: stops once the budget is spent", nextScanPollDelay(SCAN_POLL_BUDGET_MS, 40) === null);
must("schedule: stops well after the budget", nextScanPollDelay(SCAN_POLL_BUDGET_MS + 60_000, 41) === null);

// Walk a whole round as the page does: ask, wait, ask… until the schedule says stop.
let elapsed = 0;
let tries = 0;
let stoppedAt = null;
const delays = [];
for (let guard = 0; guard < 1000; guard += 1) {
  tries += 1;
  const wait = nextScanPollDelay(elapsed, tries);
  if (wait === null) { stoppedAt = elapsed; break; }
  must(`schedule: a positive wait at ${elapsed} ms`, wait > 0);
  delays.push(wait);
  elapsed += wait;
}
must("schedule: a walked round does stop", stoppedAt !== null);
must(`schedule: a walked round never stops before 300 s (stopped at ${stoppedAt} ms)`, stoppedAt !== null && stoppedAt >= 300_000);
must("schedule: a walked round asks 4 s apart for the first minute", delays.slice(0, 15).every((d) => d === 4_000));
must("schedule: a walked round is not a fixed 8 tries", tries > 9);
must("schedule: never null at any second before 300 s", Array.from({ length: 300 }, (_, s) => nextScanPollDelay(s * 1000, 1 + Math.floor(s / 4))).every((d) => d !== null));

// 2. The bubble's wiring, read from its source.
const bubble = fs.readFileSync(path.join(root, "app/inbox/InboxAttachment.tsx"), "utf8");
must("InboxAttachment.tsx: imports the shared schedule", /import \{ nextScanPollDelay \} from "@\/lib\/studioflow\/scanPollSchedule";/.test(bubble));
must("InboxAttachment.tsx: asks the schedule how long to wait", /nextScanPollDelay\(Date\.now\(\) - startedAt\.current, scanTries\.current\)/.test(bubble));
must("InboxAttachment.tsx: \"still being checked\" only when the schedule says stop", /if \(wait === null\) \{\s*show\(\{ at: "waited" \}\);/.test(bubble));
must("InboxAttachment.tsx: no fixed try count left", !/SCAN_POLL_TRIES|SCAN_POLL_MS\b/.test(bubble));
must("InboxAttachment.tsx: no timer is set while the tab is hidden", /if \(!document\.hidden\) \{\s*timer\.current = window\.setTimeout/.test(bubble));
must("InboxAttachment.tsx: re-asks when the tab becomes visible", /document\.addEventListener\("visibilitychange", recheck\)/.test(bubble));
must("InboxAttachment.tsx: re-asks when the window gets focus", /window\.addEventListener\("focus", recheck\)/.test(bubble));
must("InboxAttachment.tsx: re-asks only while scanning or waited, with nothing pending", /\(at === "scanning" \|\| at === "waited"\) && timer\.current === null && !asking\.current/.test(bubble));
must("InboxAttachment.tsx: removes its listeners", /document\.removeEventListener\("visibilitychange", recheck\)/.test(bubble) && /window\.removeEventListener\("focus", recheck\)/.test(bubble));
must("InboxAttachment.tsx: clears its timer when the message changes", /\}, \[companyId, conversationId, messageId, show, stopTimer\]\);/.test(bubble) && /round\.current \+= 1;\s*stopTimer\(\);/.test(bubble));
must("InboxAttachment.tsx: drops a late answer for another message", /if \(!alive\.current \|\| mine !== round\.current\) return;/.test(bubble));
must("InboxAttachment.tsx: \"Check again\" is still offered", /\{t\("Check again"\)\}/.test(bubble));
must("InboxAttachment.tsx: a ready answer shows the photo in place", /show\(\{ at: "ready", url: url\.current, kind: answer\.kind \}\)/.test(bubble));

if (failures.length) {
  console.error(`${failures.length} scan-poll check(s) failed (${passed} passed):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`All ${passed} scan-poll checks pass: the photo keeps being asked about for ${SCAN_POLL_BUDGET_MS / 1000} s and appears without a reload.`);
