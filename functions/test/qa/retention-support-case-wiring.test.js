// Gap 8 of the retention wiring: the support-case stamp is written by the ticket paths, not by a
// sweep that would notice a case hours late. This pins the four call sites in index.js by text,
// the way the other wiring tests do, so a refactor that drops one is named rather than silent.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
let failures = 0;
function check(name, fn) { return Promise.resolve().then(fn).then(() => console.log("PASS ", name)).catch((error) => { failures += 1; console.log("FAIL ", name, "-", String(error && error.message || error)); }); }
const index = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
(async () => {
  await check("the sync helper reads both ticket queues and delegates the stamp to the writer", () => {
    assert.ok(index.includes("async function nvRetentionSupportCaseSync(companyId)"));
    assert.ok(index.includes('db.collection("supportTickets").where("companyId", "==", companyId).limit(50).get()'));
    assert.ok(index.includes('db.collection("companies").doc(companyId).collection("workspaceTickets").limit(50).get()'));
    assert.ok(index.includes("retentionWriter.markSupportCase(db, companyId, { open: retentionWriter.supportCaseOpenFrom(statuses), nowMs: Date.now() })"));
    assert.ok(index.includes('console.warn("retention support-case stamp skipped:"'), "a stamp failure is logged, never thrown at the ticket");
  });
  await check("all four ticket paths call it: app create, workspace create, app status, workspace status", () => {
    const calls = index.split("await nvRetentionSupportCaseSync(").length - 1;
    assert.strictEqual(calls, 4, `expected 4 call sites, found ${calls}`);
    assert.ok(index.includes('await rememberTicketForDedupe("app", companyId, uid, payload.title, ticketRef.id);\n  await nvRetentionSupportCaseSync(companyId);'));
    assert.ok(index.includes('await rememberTicketForDedupe("workspace", companyId, uid, payload.title, ticketRef.id);\n  await nvRetentionSupportCaseSync(companyId);'));
    assert.ok(index.includes('await nvRetentionSupportCaseSync(String((ticketSnap.data() || {}).companyId || ""));'), "the app-status path takes the workspace from the ticket");
    assert.ok(index.includes('await nvRetentionSupportCaseSync(companyId);\n  return { ok: true, ticketId, status, message: "Workspace ticket status updated." };'));
  });
  console.log(failures ? `\n❌ RETENTION SUPPORT-CASE WIRING: ${failures} FAIL` : "\n✅ RETENTION SUPPORT-CASE WIRING GEÇTİ");
  process.exit(failures ? 1 : 0);
})();
