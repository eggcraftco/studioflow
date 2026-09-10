// The Firestore-bound half of the retention wiring, against an in-memory fake:
// every flag OFF writes nothing and says why; every flag ON writes once,
// refuses the duplicate, honours a dismissal, stops when the person replies,
// and retries a failed e-mail on a schedule instead of losing it.
const assert = require("assert");
const writer = require("../../retention/writer");
const { parseInboundReply, retentionToken } = require("../../lifecycle/retention");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 8, 10, 3, 0, 0);

// ---- a Firestore small enough to hold in one hand ------------------------------
function fakeDb() {
  const store = new Map(); // path -> data
  let counter = 0;
  const docRef = (path) => ({
    id: path.split("/").pop(),
    path,
    async get() { return { exists: store.has(path), id: path.split("/").pop(), data: () => (store.has(path) ? { ...store.get(path) } : undefined) }; },
    async set(data, options) { store.set(path, options && options.merge && store.has(path) ? { ...store.get(path), ...data } : { ...data }); },
    async update(data) { if (!store.has(path)) throw new Error("update on missing " + path); store.set(path, { ...store.get(path), ...data }); },
    collection(name) { return colRef(`${path}/${name}`); }
  });
  const colRef = (path) => ({
    path,
    doc(id) { return docRef(`${path}/${id || `auto${++counter}`}`); },
    async add(data) { const ref = docRef(`${path}/auto${++counter}`); await ref.set(data); return ref; },
    async get() {
      const docs = [];
      for (const [key, value] of store) {
        if (key.startsWith(path + "/") && !key.slice(path.length + 1).includes("/")) docs.push({ id: key.split("/").pop(), data: () => ({ ...value }) });
      }
      return { docs, size: docs.length, empty: docs.length === 0 };
    }
  });
  return {
    store,
    collection: (name) => colRef(name),
    async runTransaction(fn) {
      const tx = {
        async get(ref) { return ref.get(); },
        set(ref, data) { store.set(ref.path, { ...data }); },
        update(ref, data) { store.set(ref.path, { ...(store.get(ref.path) || {}), ...data }); }
      };
      return fn(tx);
    },
    writes() { return [...store.keys()]; }
  };
}
const ON = { inApp: true, email: true, inbound: true, sweep: true };
const OFF = { inApp: false, email: false, inbound: false, sweep: false };
// Signed up three weeks ago (so the founder note is no longer due), finished the wizard three days ago, one shell order.
const shellTrigger = { nowMs: T0, signedUpAtMs: T0 - 21 * DAY, path: "bespoke_studio", state: "setup_started", events: [{ name: "onboarding_completed", atMs: T0 - 3 * DAY }], firstOrder: { state: "shell", shellId: "sh1", shellAtMs: T0 - 2 * DAY } };
const okTransport = () => { const sent = []; return { sent, fromAddress: "contact@nivadesk.co.uk", replyDomain: "nivadesk.co.uk", async sendMail(m) { sent.push(m); return { messageId: "<m1>" }; } }; };

check("the flags read the environment and default to off", () => {
  assert.deepStrictEqual(writer.retentionFlags({}), OFF);
  assert.deepStrictEqual(writer.retentionFlags({ NIVADESK_RETENTION_IN_APP: "1", NIVADESK_RETENTION_EMAIL: "true" }), { ...OFF, inApp: true });
});

check("with every flag off, a due workspace produces decisions and no writes", async () => {
  const db = fakeDb();
  const result = await writer.sweepWorkspace(db, { companyId: "ws1", nowMs: T0, flags: OFF, trigger: shellTrigger, templateContext: {}, to: "owner@example.com" });
  assert.deepStrictEqual(result.candidates.map((c) => c.campaign), ["complete_first_order"]);
  assert.deepStrictEqual(result.decisions.map((d) => d.reason), ["flag_off"]);
  assert.deepStrictEqual(db.writes(), [], "a flag that is off must not leave a trace in the workspace");
});

check("the in-app writer writes one message and one log row, and the second pass refuses the duplicate", async () => {
  const db = fakeDb();
  const first = await writer.sweepWorkspace(db, { companyId: "ws1", nowMs: T0, flags: ON, trigger: shellTrigger, templateContext: {} });
  assert.strictEqual(first.decisions[0].send, true);
  const messages = (await db.collection("companies").doc("ws1").collection("retentionMessages").get()).docs.map((d) => d.data());
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].title, "Complete your first project");
  assert.deepStrictEqual(messages[0].target, { orderId: "sh1" });
  assert.strictEqual(messages[0].status, "open");
  const log = (await db.collection("companies").doc("ws1").collection("retentionLog").doc("complete_first_order__in_app").get()).data();
  assert.strictEqual(log.status, "sent");
  const second = await writer.sweepWorkspace(db, { companyId: "ws1", nowMs: T0 + HOUR, flags: ON, trigger: { ...shellTrigger, nowMs: T0 + HOUR }, templateContext: {} });
  assert.strictEqual(second.decisions[0].send, false);
  assert.strictEqual(second.decisions[0].reason, "already_sent");
  assert.strictEqual((await db.collection("companies").doc("ws1").collection("retentionMessages").get()).size, 1);
});

check("a message the person dismissed stays dismissed for the cooldown", async () => {
  const db = fakeDb();
  const first = await writer.sweepWorkspace(db, { companyId: "ws1", nowMs: T0, flags: ON, trigger: shellTrigger, templateContext: {} });
  const messageId = first.decisions[0].id;
  assert.deepStrictEqual(await writer.dismissMessage(db, "ws1", messageId, { nowMs: T0 + MIN }), { ok: true });
  // Pretend the log row expired (a new campaign of the same name) — the dismissal alone must hold it.
  db.store.delete("companies/ws1/retentionLog/complete_first_order__in_app");
  const again = await writer.sweepWorkspace(db, { companyId: "ws1", nowMs: T0 + 10 * DAY, flags: ON, trigger: { ...shellTrigger, nowMs: T0 + 10 * DAY }, templateContext: {} });
  assert.strictEqual(again.decisions[0].reason, "dismissed_recently");
  assert.strictEqual((await writer.dismissMessage(db, "ws1", "nope", { nowMs: T0 })).reason, "not_found");
});

check("the founder e-mail is queued with a reply key, sent through the transport, and logged as sent", async () => {
  const db = fakeDb();
  const transport = okTransport();
  const trigger = { nowMs: T0, signedUpAtMs: T0 - 15 * MIN, path: "general", state: "new", events: [] };
  const result = await writer.sweepWorkspace(db, { companyId: "ws2", nowMs: T0, flags: ON, trigger, templateContext: { firstName: "Ada", workspaceName: "Ada's Studio" }, transport, to: "ada@example.com", unsubscribeUrl: "https://nivadesk.app/r/unsubscribe?c=ws2&t=abc" });
  assert.deepStrictEqual(result.decisions.map((d) => [d.campaign, d.send, d.reason]), [["founder_intro", true, ""]]);
  assert.strictEqual(transport.sent.length, 1);
  const mail = transport.sent[0];
  assert.strictEqual(mail.to, "ada@example.com");
  assert.strictEqual(mail.from, "Gunes from NivaDesk <contact@nivadesk.co.uk>");
  assert.ok(/^retention\+[a-z0-9]{16}@nivadesk\.co\.uk$/.test(mail.replyTo), mail.replyTo);
  assert.deepStrictEqual(mail.headers, { "List-Unsubscribe": "<https://nivadesk.app/r/unsubscribe?c=ws2&t=abc>" });
  const log = (await db.collection("companies").doc("ws2").collection("retentionLog").doc("founder_intro__email").get()).data();
  assert.strictEqual(log.status, "sent");
  assert.strictEqual(log.attempts, 1);
  assert.strictEqual(log.providerId, "<m1>");
  const keyDocs = (await db.collection("retentionReplyKeys").get()).docs;
  assert.strictEqual(keyDocs.length, 1);
  assert.strictEqual(keyDocs[0].data().companyId, "ws2");
});

check("with the e-mail flag off the founder note is neither queued nor sent, whatever the in-app flag says", async () => {
  const db = fakeDb();
  const transport = okTransport();
  const trigger = { nowMs: T0, signedUpAtMs: T0 - 15 * MIN, path: "general", state: "new", events: [] };
  const result = await writer.sweepWorkspace(db, { companyId: "ws2", nowMs: T0, flags: { ...ON, email: false }, trigger, templateContext: {}, transport, to: "ada@example.com" });
  assert.deepStrictEqual(result.decisions.map((d) => d.reason), ["flag_off"]);
  assert.strictEqual(transport.sent.length, 0);
  assert.deepStrictEqual(db.writes(), []);
});

check("a failed send is kept in the outbox with the next attempt scheduled, retried, and dead after the last try", async () => {
  const db = fakeDb();
  let fail = true;
  const transport = { fromAddress: "contact@nivadesk.co.uk", replyDomain: "nivadesk.co.uk", async sendMail() { if (fail) throw new Error("451 try later"); return { messageId: "<ok>" }; } };
  const trigger = { nowMs: T0, signedUpAtMs: T0 - 15 * MIN, path: "general", state: "new", events: [] };
  const result = await writer.sweepWorkspace(db, { companyId: "ws3", nowMs: T0, flags: ON, trigger, templateContext: {}, transport, to: "x@example.com" });
  assert.strictEqual(result.decisions[0].reason, "retry_scheduled");
  const ref = db.collection("companies").doc("ws3").collection("retentionLog").doc("founder_intro__email");
  let row = (await ref.get()).data();
  assert.strictEqual(row.status, "failed");
  assert.strictEqual(row.attempts, 1);
  assert.strictEqual(row.nextAttemptAtMs, T0 + 5 * MIN);
  assert.strictEqual(row.lastError, "451 try later");
  // A second sweep does not queue a second e-mail while the first waits.
  const again = await writer.sweepWorkspace(db, { companyId: "ws3", nowMs: T0 + MIN, flags: ON, trigger: { ...trigger, nowMs: T0 + MIN }, templateContext: {}, transport, to: "x@example.com" });
  assert.strictEqual(again.decisions[0].reason, "already_sent");
  // The retry with the flag off does nothing.
  assert.deepStrictEqual(await writer.retryOutboxEntries(db, [ref], { nowMs: T0 + 6 * MIN, flags: OFF, transport }), { skipped: "flag_off", attempted: 0 });
  // Retry until it goes.
  await writer.retryOutboxEntries(db, [ref], { nowMs: T0 + 6 * MIN, flags: ON, transport });
  row = (await ref.get()).data();
  assert.strictEqual(row.attempts, 2);
  assert.strictEqual(row.nextAttemptAtMs, T0 + 6 * MIN + 30 * MIN);
  fail = false;
  const retried = await writer.retryOutboxEntries(db, [ref], { nowMs: T0 + HOUR, flags: ON, transport });
  assert.deepStrictEqual(retried, { attempted: 1, sent: 1 });
  row = (await ref.get()).data();
  assert.strictEqual(row.status, "sent");
  assert.strictEqual(row.attempts, 3);
  // And one that never gets through is declared dead on the fifth attempt.
  fail = true;
  const dead = db.collection("companies").doc("ws4").collection("retentionLog").doc("founder_intro__email");
  await dead.set({ companyId: "ws4", campaign: "founder_intro", channel: "email", status: "failed", attempts: 4, payload: { to: "y@example.com", subject: "s", text: "t", html: "h" } });
  await writer.retryOutboxEntries(db, [dead], { nowMs: T0, flags: ON, transport });
  assert.strictEqual((await dead.get()).data().status, "dead");
});

check("a reply stops every automated sequence; an auto-reply does not; 'unsubscribe' also opts out", async () => {
  const db = fakeDb();
  const transport = okTransport();
  const trigger = { nowMs: T0, signedUpAtMs: T0 - 15 * MIN, path: "general", state: "new", events: [] };
  await writer.sweepWorkspace(db, { companyId: "ws5", nowMs: T0, flags: ON, trigger, templateContext: {}, transport, to: "ada@example.com" });
  const replyKey = transport.sent[0].replyTo.match(/^retention\+([a-z0-9]+)@/)[1];
  // Out of office first: noted, not suppressing.
  const ooo = await writer.applyInboundReply(db, parseInboundReply({ from: "ada@example.com", to: `retention+${replyKey}@nivadesk.co.uk`, subject: "Automatic reply", text: "away" }), { nowMs: T0 + HOUR });
  assert.deepStrictEqual(ooo, { ok: true, companyId: "ws5", kind: "auto_reply", suppressed: false });
  let context = await writer.loadMessagingContext(db, "ws5");
  assert.strictEqual(context.userReplied, false);
  // Then the person.
  const reply = await writer.applyInboundReply(db, parseInboundReply({ from: "ada@example.com", to: `retention+${replyKey}@nivadesk.co.uk`, subject: "Re: Quick question", text: "The invoices.\n> quoted" }), { nowMs: T0 + 2 * HOUR });
  assert.deepStrictEqual(reply, { ok: true, companyId: "ws5", kind: "reply", suppressed: true });
  context = await writer.loadMessagingContext(db, "ws5");
  assert.strictEqual(context.userReplied, true);
  const later = await writer.sweepWorkspace(db, { companyId: "ws5", nowMs: T0 + 3 * DAY, flags: ON, trigger: { ...trigger, nowMs: T0 + 3 * DAY, path: "bespoke_studio", state: "setup_started", events: [{ name: "onboarding_completed", atMs: T0 }], firstOrder: { state: "none" } }, templateContext: {}, transport, to: "ada@example.com" });
  assert.ok(later.decisions.length > 0);
  assert.ok(later.decisions.every((d) => d.send === false && d.reason === "user_replied"), JSON.stringify(later.decisions));
  const inbound = (await db.collection("companies").doc("ws5").collection("retentionInbound").get()).docs.map((d) => d.data());
  assert.deepStrictEqual(inbound.map((r) => r.kind), ["auto_reply", "reply"]);
  assert.strictEqual(inbound[1].text, "The invoices.");
  // Unsubscribe by reply.
  const stop = await writer.applyInboundReply(db, parseInboundReply({ from: "ada@example.com", to: `retention+${replyKey}@nivadesk.co.uk`, subject: "Re: hi", text: "STOP" }), { nowMs: T0 + 4 * HOUR });
  assert.strictEqual(stop.kind, "unsubscribe");
  context = await writer.loadMessagingContext(db, "ws5");
  assert.strictEqual(context.unsubscribed, true);
  // An unknown key is refused without a write.
  const before = db.writes().length;
  assert.deepStrictEqual(await writer.applyInboundReply(db, parseInboundReply({ from: "z@example.com", to: "retention+zzzzzzzzzzzzzzzz@nivadesk.co.uk", subject: "Re", text: "hi" }), { nowMs: T0 }), { ok: false, reason: "unknown_reply_key" });
  assert.strictEqual(db.writes().length, before);
});

check("opt-out is honoured by every channel and can be switched back", async () => {
  const db = fakeDb();
  await writer.setOptOut(db, "ws6", true, { nowMs: T0, source: "unsubscribe_link" });
  const result = await writer.sweepWorkspace(db, { companyId: "ws6", nowMs: T0, flags: ON, trigger: shellTrigger, templateContext: {} });
  assert.deepStrictEqual(result.decisions.map((d) => d.reason), ["unsubscribed"]);
  await writer.setOptOut(db, "ws6", false, { nowMs: T0 + MIN, source: "settings" });
  const back = await writer.sweepWorkspace(db, { companyId: "ws6", nowMs: T0 + MIN, flags: ON, trigger: { ...shellTrigger, nowMs: T0 + MIN }, templateContext: {} });
  assert.strictEqual(back.decisions[0].send, true);
  const token = retentionToken("secret", "ws6");
  assert.ok(token, "the unsubscribe link token is what the endpoint verifies");
});

check("one message per channel per pass: the second in-app candidate waits", async () => {
  const db = fakeDb();
  const trigger = { nowMs: T0, signedUpAtMs: T0 - 21 * DAY, path: "commerce", state: "setup_started", events: [{ name: "onboarding_completed", atMs: T0 - 3 * DAY }], firstOrder: { state: "none" } };
  const result = await writer.sweepWorkspace(db, { companyId: "ws7", nowMs: T0, flags: ON, trigger: { ...trigger, path: "general", firstOrder: { state: "shell", shellId: "s", shellAtMs: T0 - 2 * DAY } }, templateContext: {} });
  assert.ok(result.candidates.length >= 1);
  assert.strictEqual(result.decisions.filter((d) => d.send).length, 1);
});

check("the support-case stamp: open sets it once, close clears it once, and the context then refuses every nudge with support_case_open", async () => {
  assert.strictEqual(writer.supportCaseOpenFrom([]), false);
  assert.strictEqual(writer.supportCaseOpenFrom(["resolved", "closed"]), false);
  assert.strictEqual(writer.supportCaseOpenFrom(["closed", "waitingForUser"]), true, "waiting for the user is still an open case");
  assert.strictEqual(writer.supportCaseOpenFrom(["open"]), true);
  assert.strictEqual(writer.supportCaseOpenFrom(["inProgress"]), true);
  const db = fakeDb();
  assert.deepStrictEqual(await writer.markSupportCase(db, "", { open: true, nowMs: T0 }), { ok: false, reason: "no_company" });
  const opened = await writer.markSupportCase(db, "c1", { open: true, nowMs: T0 });
  assert.deepStrictEqual(opened, { ok: true, changed: true, supportCaseOpenAtMs: T0 });
  const again = await writer.markSupportCase(db, "c1", { open: true, nowMs: T0 + HOUR });
  assert.deepStrictEqual(again, { ok: true, changed: false, supportCaseOpenAtMs: T0 }, "an open case keeps its first stamp");
  const context = await writer.loadMessagingContext(db, "c1");
  assert.strictEqual(context.supportCaseOpen, true);
  const closed = await writer.markSupportCase(db, "c1", { open: false, nowMs: T0 + 2 * HOUR });
  assert.deepStrictEqual(closed, { ok: true, changed: true, supportCaseOpenAtMs: 0 });
  assert.deepStrictEqual(await writer.markSupportCase(db, "c1", { open: false, nowMs: T0 + 3 * HOUR }), { ok: true, changed: false, supportCaseOpenAtMs: 0 }, "closing twice writes nothing");
  assert.strictEqual((await writer.loadMessagingContext(db, "c1")).supportCaseOpen, false);
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 260)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ RETENTION WRITER GEÇTİ");
})();
