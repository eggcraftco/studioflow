// The pure half of the retention wiring: what a workspace is due, what it says,
// what a reply means, when a failed send is retried, and the tokens an e-mail
// carries. No Firestore, no clock, no network — every input is handed in.
const assert = require("assert");
const {
  triggerCandidates, renderTemplate, parseInboundReply, outboxSchedule,
  retentionToken, verifyRetentionToken, newReplyKey, DEFAULT_RETENTION_TIMINGS, RETENTION_CAMPAIGNS,
  workspaceScope, feedbackPromptRecent, INTERNAL_DOMAINS
} = require("../../lifecycle/retention");
const { messageDecision, CAMPAIGN_GOALS } = require("../../lifecycle/messaging");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 8, 1, 9, 0, 0);
const names = (list) => list.map((c) => c.campaign);

check("nothing is proposed without a clock or a signup time", () => {
  assert.deepStrictEqual(triggerCandidates({}), []);
  assert.deepStrictEqual(triggerCandidates({ nowMs: T0 }), []);
  assert.deepStrictEqual(triggerCandidates({ nowMs: T0, signedUpAtMs: T0 + DAY }), [], "a signup in the future proposes nothing");
});

check("the founder note is due minutes after signup, not before and not months later", () => {
  const base = { signedUpAtMs: T0, path: "general", state: "new", events: [] };
  assert.deepStrictEqual(names(triggerCandidates({ ...base, nowMs: T0 + 5 * MIN })), []);
  assert.deepStrictEqual(names(triggerCandidates({ ...base, nowMs: T0 + 11 * MIN })), ["founder_intro"]);
  // After a fortnight the welcome is gone; the unfinished wizard still gets its reminder.
  assert.deepStrictEqual(names(triggerCandidates({ ...base, nowMs: T0 + 15 * DAY })), ["finish_onboarding"], "a welcome after a fortnight is not a welcome");
  const timed = triggerCandidates({ ...base, nowMs: T0 + 2 * MIN, timings: { founderIntroAfterMs: MIN } });
  assert.deepStrictEqual(names(timed), ["founder_intro"], "timings are configuration");
  assert.strictEqual(timed[0].channel, "email");
  assert.strictEqual(timed[0].kind, "founder");
});

check("an unfinished wizard gets one reminder after twelve hours, and nothing else is asked for yet", () => {
  const base = { signedUpAtMs: T0, path: "commerce", state: "onboarding", events: [{ name: "onboarding_started", atMs: T0 }] };
  assert.deepStrictEqual(names(triggerCandidates({ ...base, nowMs: T0 + 6 * HOUR })), ["founder_intro"]);
  const later = triggerCandidates({ ...base, nowMs: T0 + 13 * HOUR });
  assert.deepStrictEqual(names(later), ["founder_intro", "finish_onboarding"]);
  assert.ok(!names(later).includes("connect_first_store"), "the path is not known before the wizard is finished");
});

check("a commerce workspace with no shop is asked to connect one; one with a shop is not", () => {
  const done = [{ name: "onboarding_completed", atMs: T0 }];
  const asked = triggerCandidates({ nowMs: T0 + 13 * HOUR, signedUpAtMs: T0, path: "commerce", state: "setup_started", events: done });
  assert.deepStrictEqual(names(asked), ["founder_intro", "connect_first_store"]);
  const connected = triggerCandidates({ nowMs: T0 + 13 * HOUR, signedUpAtMs: T0, path: "commerce", state: "setup_started", events: [...done, { name: "integration_connected", atMs: T0 + HOUR }] });
  assert.ok(!names(connected).includes("connect_first_store"));
  // And the decision engine would cancel it anyway if it slipped through (§24).
  assert.strictEqual(messageDecision({ campaign: "connect_first_store", channel: "in_app", nowMs: T0 + 13 * HOUR }, { doneEventNames: ["integration_connected"] }).reason, "goal_already_met");
});

check("a shell first order is pointed back at; no order at all is asked for; a real one is left alone", () => {
  const done = [{ name: "onboarding_completed", atMs: T0 }];
  const base = { nowMs: T0 + 2 * DAY, signedUpAtMs: T0, path: "bespoke_studio", state: "setup_started", events: done };
  const shell = triggerCandidates({ ...base, firstOrder: { state: "shell", shellId: "o1", shellAtMs: T0 + HOUR } });
  assert.deepStrictEqual(names(shell), ["founder_intro", "complete_first_order"]);
  const freshShell = triggerCandidates({ ...base, firstOrder: { state: "shell", shellId: "o1", shellAtMs: T0 + 2 * DAY - HOUR } });
  assert.ok(!names(freshShell).includes("complete_first_order"), "a shell an hour old is somebody still typing");
  const none = triggerCandidates({ ...base, firstOrder: { state: "none" } });
  assert.deepStrictEqual(names(none), ["founder_intro", "create_first_order"]);
  const real = triggerCandidates({ ...base, firstOrder: { state: "substantive", orderId: "o9" } });
  assert.deepStrictEqual(names(real), ["founder_intro"]);
  assert.ok(CAMPAIGN_GOALS.complete_first_order.includes("order_created"), "the shell campaign is cancelled by the order becoming real");
});

check("a cancelled workspace and a month of silence get no nudge", () => {
  const done = [{ name: "onboarding_completed", atMs: T0 }];
  assert.deepStrictEqual(names(triggerCandidates({ nowMs: T0 + 2 * DAY, signedUpAtMs: T0, path: "general", state: "churned", events: done, firstOrder: { state: "none" } })), ["founder_intro"]);
  const quiet = triggerCandidates({ nowMs: T0 + 40 * DAY, signedUpAtMs: T0, path: "general", state: "dormant", events: done, firstOrder: { state: "none" } });
  assert.deepStrictEqual(names(quiet), []);
});

check("candidates come out in priority order and every campaign has a channel and a kind", () => {
  const all = triggerCandidates({ nowMs: T0 + 2 * DAY, signedUpAtMs: T0, path: "general", state: "setup_started", events: [{ name: "onboarding_completed", atMs: T0 }], firstOrder: { state: "shell", shellId: "s", shellAtMs: T0 } });
  const priorities = all.map((c) => RETENTION_CAMPAIGNS[c.campaign].priority);
  assert.deepStrictEqual(priorities, [...priorities].sort((a, b) => a - b));
  for (const [campaign, def] of Object.entries(RETENTION_CAMPAIGNS)) {
    assert.ok(["in_app", "email"].includes(def.channel), campaign);
    assert.ok(def.kind, campaign);
  }
});

check("the founder e-mail is replyable, plain, and escapes what the workspace typed", () => {
  const mail = renderTemplate("founder_intro", { firstName: "Ada", workspaceName: "<b>Ada's Studio</b>", unsubscribeUrl: "https://nivadesk.app/u?x=1" });
  assert.strictEqual(mail.subject, "Quick question about <b>Ada's Studio</b>");
  assert.ok(mail.text.startsWith("Hi Ada,"));
  assert.ok(mail.text.includes("reply to this e-mail"));
  assert.ok(!mail.html.includes("<b>Ada"), "HTML from a workspace name was not escaped");
  assert.ok(mail.html.includes("&lt;b&gt;Ada&#39;s Studio&lt;/b&gt;"));
  assert.strictEqual(mail.replyTo, "contact@eggcraft.co.uk");
  assert.strictEqual(mail.fromName, "Gunes from NivaDesk");
  assert.ok(mail.text.includes("https://nivadesk.app/u?x=1"), "no unsubscribe line");
  assert.ok((mail.text.match(/https?:\/\//g) || []).length <= 2, "a founder note is not a wall of links");
});

check("in-app templates carry an action the clients map, and the shell one carries the order", () => {
  const shell = renderTemplate("complete_first_order", { target: { orderId: "abc" } });
  assert.deepStrictEqual(shell, { title: "Complete your first project", body: "You started one — add the customer, what it is worth or what it contains, and it counts.", action: "open_order", target: { orderId: "abc" } });
  assert.strictEqual(renderTemplate("complete_first_order", {}).target, null, "no id, no dead deep link");
  for (const campaign of ["finish_onboarding", "connect_first_store", "connect_bank", "create_first_order"]) {
    const t = renderTemplate(campaign, {});
    assert.ok(t && t.title && t.body && t.action, campaign);
  }
  assert.strictEqual(renderTemplate("something_else", {}), null);
});

check("a reply is recognised by its key, stripped of the quoted thread, and told apart from an auto-reply", () => {
  const reply = parseInboundReply({
    from: "Ada Lovelace <ada@example.com>", to: "Gunes from NivaDesk <retention+abc123def456@nivadesk.co.uk>",
    subject: "Re: Quick question about Ada's Studio",
    text: "Mostly the invoices, honestly.\n\nOn Tue, Gunes wrote:\n> I'm Gunes, I build NivaDesk.\n> One question"
  });
  assert.strictEqual(reply.kind, "reply");
  assert.strictEqual(reply.replyKey, "abc123def456");
  assert.strictEqual(reply.fromEmail, "ada@example.com");
  assert.strictEqual(reply.text, "Mostly the invoices, honestly.");
  const ooo = parseInboundReply({ from: "ada@example.com", to: "retention+abc123def456@nivadesk.co.uk", subject: "Automatic reply: Quick question", text: "I am out of the office" });
  assert.strictEqual(ooo.kind, "auto_reply");
  const header = parseInboundReply({ from: "ada@example.com", to: "retention+abc123def456@nivadesk.co.uk", subject: "Re: hi", text: "back next week", headers: { "Auto-Submitted": "auto-replied" } });
  assert.strictEqual(header.kind, "auto_reply");
  const bounce = parseInboundReply({ from: "MAILER-DAEMON@mail.example.com", to: "retention+abc123def456@nivadesk.co.uk", subject: "Undelivered", text: "550" });
  assert.strictEqual(bounce.kind, "bounce");
  const stop = parseInboundReply({ from: "ada@example.com", to: "retention+abc123def456@nivadesk.co.uk", subject: "Re: hi", text: "unsubscribe please" });
  assert.strictEqual(stop.kind, "unsubscribe");
  const subjectKey = parseInboundReply({ from: "ada@example.com", to: "contact@eggcraft.co.uk", subject: "Re: Quick question [NV-abc123def456]", text: "yes" });
  assert.strictEqual(subjectKey.replyKey, "abc123def456");
  assert.strictEqual(parseInboundReply({ from: "ada@example.com", to: "contact@eggcraft.co.uk", subject: "hello", text: "" }).replyKey, "");
});

check("a failed send is retried with growing gaps and then declared dead", () => {
  const first = outboxSchedule(1, T0);
  assert.deepStrictEqual(first, { retry: true, dead: false, nextAttemptAtMs: T0 + 5 * MIN });
  assert.strictEqual(outboxSchedule(2, T0).nextAttemptAtMs, T0 + 30 * MIN);
  assert.strictEqual(outboxSchedule(4, T0).nextAttemptAtMs, T0 + 12 * HOUR);
  assert.deepStrictEqual(outboxSchedule(5, T0), { retry: false, dead: true, nextAttemptAtMs: 0 });
  assert.strictEqual(outboxSchedule(2, T0, { backoffMs: [MIN], maxAttempts: 10 }).nextAttemptAtMs, T0 + MIN, "the backoff is configuration");
});

check("an unsubscribe token binds the secret to the workspace and nothing else verifies", () => {
  const token = retentionToken("s3cret", "ws1");
  assert.strictEqual(token.length, 32);
  assert.ok(verifyRetentionToken("s3cret", "ws1", token));
  assert.ok(!verifyRetentionToken("s3cret", "ws2", token));
  assert.ok(!verifyRetentionToken("other", "ws1", token));
  assert.ok(!verifyRetentionToken("s3cret", "ws1", token.slice(0, 31) + "x"));
  assert.ok(!verifyRetentionToken("", "ws1", ""), "no secret, no token, no match");
  assert.strictEqual(retentionToken("", "ws1"), "");
  const key = newReplyKey();
  assert.ok(/^[a-z0-9]{16}$/.test(key), key);
  assert.notStrictEqual(newReplyKey(), key);
});

check("the defaults are the spec's numbers", () => {
  assert.strictEqual(DEFAULT_RETENTION_TIMINGS.setupReminderAfterMs, 12 * HOUR);
  assert.strictEqual(DEFAULT_RETENTION_TIMINGS.founderIntroAfterMs, 10 * MIN);
});


check("who may be swept: nobody without a pilot list, everyone with \"*\", exact ids otherwise; excludes and our own people always win", () => {
  assert.deepStrictEqual(workspaceScope({ companyId: "w1" }), { allowed: false, reason: "not_in_pilot" });
  assert.deepStrictEqual(workspaceScope({ companyId: "w1", pilotList: "" }), { allowed: false, reason: "not_in_pilot" });
  assert.deepStrictEqual(workspaceScope({ companyId: "w1", pilotList: "*" }), { allowed: true, reason: "" });
  assert.deepStrictEqual(workspaceScope({ companyId: "w1", pilotList: "w0, w1 ,w2" }), { allowed: true, reason: "" });
  assert.deepStrictEqual(workspaceScope({ companyId: "w3", pilotList: "w0,w1" }), { allowed: false, reason: "not_in_pilot" });
  assert.deepStrictEqual(workspaceScope({ companyId: "w1", pilotList: "*", excludeList: "w9,w1" }), { allowed: false, reason: "excluded_workspace" }, "the exclude list beats *");
  assert.deepStrictEqual(workspaceScope({ companyId: "w1", pilotList: "w1", ownerEmail: "Someone@EGGcraft.co.uk" }), { allowed: true, reason: "" }, "named on the list = deliberate, even our own workspace");
  assert.deepStrictEqual(workspaceScope({ companyId: "w1", pilotList: "*", ownerEmail: "Someone@EGGcraft.co.uk" }), { allowed: false, reason: "internal_owner" }, "under the wildcard our own domain is skipped, any case");
  assert.deepStrictEqual(workspaceScope({ companyId: "w1", pilotList: "w1", excludeList: "w1", ownerEmail: "buyer@example.com" }), { allowed: false, reason: "excluded_workspace" }, "the exclude list beats an explicit id too");
  assert.deepStrictEqual(workspaceScope({ companyId: "w1", pilotList: "*", ownerEmail: "contact@nivadesk.co.uk" }), { allowed: false, reason: "internal_owner" });
  assert.deepStrictEqual(workspaceScope({ companyId: "w1", pilotList: "*", ownerEmail: "admin@gmail.com", adminEmails: "x@y.z, Admin@Gmail.com" }), { allowed: false, reason: "internal_owner" }, "an admin address on any domain");
  assert.deepStrictEqual(workspaceScope({ companyId: "w1", pilotList: "*", ownerEmail: "buyer@example.com" }), { allowed: true, reason: "" });
  assert.deepStrictEqual(workspaceScope({ companyId: "", pilotList: "*" }), { allowed: false, reason: "no_company" });
  assert.deepStrictEqual([...INTERNAL_DOMAINS], ["nivadesk.co.uk", "eggcraft.co.uk"]);
});

check("a feedback prompt shown or answered within a day holds the nudge; older ones and empty state do not", () => {
  assert.strictEqual(feedbackPromptRecent(null, T0), false);
  assert.strictEqual(feedbackPromptRecent({}, T0), false);
  assert.strictEqual(feedbackPromptRecent({ shows: [{ campaign: "first_success_feedback", atMs: T0 - HOUR }] }, T0), true);
  assert.strictEqual(feedbackPromptRecent({ submissions: [{ atMs: T0 - 23 * HOUR }] }, T0), true, "an answer counts as much as a show");
  assert.strictEqual(feedbackPromptRecent({ shows: [{ atMs: T0 - 2 * DAY }] }, T0), false);
  assert.strictEqual(feedbackPromptRecent({ shows: [{ atMs: T0 + HOUR }] }, T0), false, "a stamp in the future is ignored");
  assert.strictEqual(feedbackPromptRecent({ shows: [{ atMs: T0 - 2 * HOUR }] }, T0, HOUR), false, "the window is a parameter");
  assert.strictEqual(feedbackPromptRecent({ shows: [{ atMs: T0 - HOUR }] }, 0), false, "no clock, no hold");
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 220)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ RETENTION RULES GEÇTİ");
})();
