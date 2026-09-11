// Feedback v1 against the fake Firestore: the first-success prompt is shown only
// after a substantive order, never for a shell or an empty workspace; a closed
// prompt stays closed; an answered one never returns; the note is written once
// (retries and double clicks find the earlier one); the abuse limits hold; a
// member of another workspace is refused; the inbox is admin-only; and the
// record carries nothing the form did not ask for.
const assert = require("assert");
const { makeFakeFirestore, FakeHttpsError } = require("./helpers/fakeFirestore");
const { createFeedbackFunctions } = require("../../feedback");
const feedback = require("../../lifecycle/feedback");

const passthrough = (_options, handler) => handler;
const DAY = 24 * 60 * 60 * 1000;
let failures = 0;
function check(name, fn) { return Promise.resolve().then(fn).then(() => console.log("PASS ", name)).catch((error) => { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 300)); }); }

const LAUNCH_MS = Date.parse("2026-09-09T00:00:00.000Z");   // NIVADESK_FEEDBACK_INVITE_FROM_MS for the tests
function build({ enabled = true, pilot = "c1,other", inviteFrom = LAUNCH_MS } = {}) {
  const nowRef = { value: Date.parse("2026-09-10T12:00:00.000Z") };
  const store = makeFakeFirestore(nowRef);
  const flags = { enabled, pilot, inviteFrom };
  store.write("companies/c1", { name: "Acme Studio", ownerUid: "u1", members: { u1: { role: "owner" }, u2: { role: "member" } } });
  store.write("companies/other", { name: "Other", ownerUid: "u3", members: { u3: { role: "owner" } } });
  const fns = createFeedbackFunctions({
    admin: store.admin, HttpsError: FakeHttpsError, onCall: passthrough,
    requireWorkspaceMember: async ({ auth, data }) => {
      if (!auth) throw new FakeHttpsError("unauthenticated", "You must be signed in.");
      const companyId = String(data?.companyId || "");
      const company = store.read(`companies/${companyId}`);
      if (!company) throw new FakeHttpsError("not-found", "Workspace not found.");
      if (!company.members || !company.members[auth.uid]) throw new FakeHttpsError("permission-denied", "You do not have access to this workspace.");
      return { uid: auth.uid, email: String(auth.token?.email || ""), companyId, companyData: company };
    },
    isAdminRequest: (request) => Boolean(request.auth && request.auth.token?.email_verified === true && request.auth.token?.email === "admin@nivadesk.test"),
    featureEnabled: () => flags.enabled === true,
    pilotWorkspaces: () => flags.pilot,
    inviteFromMs: () => flags.inviteFrom,
    now: () => nowRef.value
  });
  return { fns, store, nowRef, flags };
}
const member = { uid: "u1", token: { email: "owner@acme.test", email_verified: true } };
const second = { uid: "u2", token: { email: "member@acme.test", email_verified: true } };
const stranger = { uid: "u3", token: { email: "u3@other.test", email_verified: true } };
const adminAuth = { uid: "admin1", token: { email: "admin@nivadesk.test", email_verified: true } };
const shell = (id, extra = {}) => ({ id, companyId: "c1", customerName: "New Order", orderValue: 0, paymentDate: "2026-09-09T10:00:00.000Z", ...extra });
const real = (id, extra = {}) => ({ id, companyId: "c1", customerName: "Ada Lovelace", orderValue: 120, paymentDate: "2026-09-10T10:00:00.000Z", createdAtMs: Date.parse("2026-09-10T10:00:00.000Z"), ...extra });
const rejects = (promise, code, pattern) => assert.rejects(promise, (error) => { assert.strictEqual(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`); if (pattern) assert.match(error.message, pattern); return true; });

(async () => {
  await check("flag off: the prompt says the feature is off, and no write is accepted", async () => {
    const { fns, store } = build({ enabled: false });
    store.write("siparisler/o1", real("o1"));
    const out = await fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } });
    assert.deepStrictEqual({ enabled: out.enabled, show: out.show, reason: out.reason }, { enabled: false, show: false, reason: "feature_off" });
    await rejects(fns.submitFeedback({ auth: member, data: { companyId: "c1", experience: "okay" } }), "failed-precondition", /not enabled/);
    await rejects(fns.dismissFeedbackPrompt({ auth: member, data: { companyId: "c1" } }), "failed-precondition", /not enabled/);
    assert.strictEqual(store.paths("feedback").length, 0); assert.strictEqual(store.paths("companies/c1/feedbackState").length, 0);
  });

  await check("a new workspace with no order is not asked, and nothing is written", async () => {
    const { fns, store } = build();
    const out = await fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } });
    assert.deepStrictEqual({ enabled: out.enabled, show: out.show, reason: out.reason }, { enabled: true, show: false, reason: "no_first_success" });
    assert.strictEqual(store.paths("companies/c1/feedbackState").length, 0);
  });

  await check("a shell order — opened, never filled — is not a first success", async () => {
    const { fns, store } = build();
    store.write("siparisler/s1", shell("s1")); store.write("siparisler/s2", shell("s2", { customerName: "Yeni Sipariş" }));
    const out = await fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } });
    assert.strictEqual(out.show, false); assert.strictEqual(out.reason, "first_order_is_shell");
    assert.strictEqual(store.paths("companies/c1/feedbackState").length, 0);
  });

  await check("the first substantive order makes the prompt eligible; asking records nothing, the confirmed showing counts once per seven days", async () => {
    const { fns, store, nowRef } = build();
    store.write("siparisler/s1", shell("s1")); store.write("siparisler/o1", real("o1"));
    const first = await fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1", page: "/orders" } });
    assert.strictEqual(first.show, true); assert.strictEqual(first.campaign, feedback.CAMPAIGN_FIRST_SUCCESS); assert.strictEqual(first.reason, "");
    assert.strictEqual(store.paths("companies/c1/feedbackState").length, 0, "asking writes nothing — a second tab asking gets the same yes");
    const secondTab = await fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } });
    assert.strictEqual(secondTab.show, true);
    // Both tabs confirm the card is on screen; inside a minute that is one showing, not two.
    const confirmA = await fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1", shown: feedback.CAMPAIGN_FIRST_SUCCESS } });
    const confirmB = await fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1", shown: feedback.CAMPAIGN_FIRST_SUCCESS } });
    assert.strictEqual(confirmA.recorded, true); assert.strictEqual(confirmB.recorded, false);
    const state = store.read("companies/c1/feedbackState/u1");
    assert.strictEqual(state.shows.length, 1); assert.deepStrictEqual(state.events.map((e) => e.name), ["feedback_prompt_shown"]);
    const again = await fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } });
    assert.strictEqual(again.show, false); assert.strictEqual(again.reason, "already_sent");
    nowRef.value += 6 * DAY;
    assert.strictEqual((await fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } })).show, false, "still inside seven days");
    nowRef.value += 2 * DAY;
    const later = await fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } });
    assert.strictEqual(later.show, true, "an unanswered prompt may return after the window");
    await fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1", shown: feedback.CAMPAIGN_FIRST_SUCCESS } });
    assert.strictEqual(store.read("companies/c1/feedbackState/u1").shows.length, 2);
    await rejects(fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1", shown: "made_up" } }), "invalid-argument");
    // Another member of the same workspace has their own history.
    const other = await fns.getFeedbackPrompt({ auth: second, data: { companyId: "c1" } });
    assert.strictEqual(other.show, true); assert.strictEqual(store.read("companies/c1/feedbackState/u2"), undefined, "asking wrote nothing for them either");
  });

  await check("the pilot list: a workspace not on it sees the feature as off and cannot send or close; \"*\" opens every workspace", async () => {
    const closed = build({ pilot: "someone-else" });
    closed.store.write("siparisler/o1", real("o1"));
    const out = await closed.fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } });
    assert.deepStrictEqual({ enabled: out.enabled, show: out.show, reason: out.reason }, { enabled: false, show: false, reason: "not_in_pilot" });
    await rejects(closed.fns.submitFeedback({ auth: member, data: { companyId: "c1", experience: "okay", trigger: "manual" } }), "failed-precondition", /for this workspace/);
    await rejects(closed.fns.dismissFeedbackPrompt({ auth: member, data: { companyId: "c1" } }), "failed-precondition", /for this workspace/);
    assert.strictEqual(closed.store.paths("feedback").length, 0);
    const empty = build({ pilot: "" });
    assert.strictEqual((await empty.fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } })).reason, "not_in_pilot", "an empty list opens nobody");
    const all = build({ pilot: "*" });
    all.store.write("siparisler/o1", real("o1"));
    assert.strictEqual((await all.fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } })).show, true);
    // The inbox is not behind the pilot list.
    assert.strictEqual((await closed.fns.listFeedback({ auth: adminAuth, data: {} })).ok, true);
  });

  await check("the launch window: no invitation without it, none for a success before it, none when the success time is not known; the manual entry is unaffected", async () => {
    const unset = build({ inviteFrom: 0 });
    unset.store.write("siparisler/o1", real("o1"));
    assert.strictEqual((await unset.fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } })).reason, "invite_window_unset");
    assert.strictEqual((await unset.fns.submitFeedback({ auth: member, data: { companyId: "c1", trigger: "manual", experience: "easy", text: "still works" } })).ok, true);
    const before = build();
    before.store.write("siparisler/o1", real("o1", { createdAtMs: LAUNCH_MS - DAY, paymentDate: "2026-09-10T10:00:00.000Z" }));
    assert.strictEqual((await before.fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } })).reason, "first_success_before_launch", "paymentDate after the launch does not rescue a pre-launch order");
    const unknown = build();
    unknown.store.write("siparisler/o1", real("o1", { createdAtMs: undefined }));
    delete unknown.store.read("siparisler/o1").createdAtMs;
    unknown.store.write("siparisler/o1", { id: "o1", companyId: "c1", customerName: "Ada Lovelace", orderValue: 120, paymentDate: "2026-09-10T10:00:00.000Z" });
    assert.strictEqual((await unknown.fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } })).reason, "first_success_time_unknown");
    const mixed = build();
    mixed.store.write("siparisler/o1", real("o1"));
    mixed.store.write("siparisler/o0", { id: "o0", companyId: "c1", customerName: "Earlier Customer", orderValue: 50, paymentDate: "2026-08-01T10:00:00.000Z" });
    assert.strictEqual((await mixed.fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } })).reason, "first_success_time_unknown", "one unstamped substantive order makes the first-success time unknowable");
    const stamped = build();
    stamped.store.write("siparisler/o1", { id: "o1", companyId: "c1", customerName: "Ada Lovelace", orderValue: 120, paymentDate: "2026-09-10T10:00:00.000Z", createdAt: { toMillis: () => LAUNCH_MS + DAY, seconds: Math.floor((LAUNCH_MS + DAY) / 1000) } });
    assert.strictEqual((await stamped.fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } })).show, true, "a server Timestamp createdAt after the launch counts");
    assert.deepStrictEqual(feedback.firstSuccess([shell("s1"), real("o2", { createdAtMs: LAUNCH_MS + 2 * DAY }), real("o1")]), { state: "substantive", known: true, atMs: Date.parse("2026-09-10T10:00:00.000Z"), orderId: "o1" });
    assert.strictEqual(feedback.firstSuccess([]).state, "none"); assert.strictEqual(feedback.firstSuccess([shell("s1")]).state, "shell");
  });

  await check("closing the prompt records feedback_prompt_dismissed and keeps it closed for the dismissal cooldown", async () => {
    const { fns, store, nowRef } = build();
    store.write("siparisler/o1", real("o1"));
    assert.strictEqual((await fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } })).show, true);
    await fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1", shown: feedback.CAMPAIGN_FIRST_SUCCESS } });
    const closed = await fns.dismissFeedbackPrompt({ auth: member, data: { companyId: "c1", campaign: feedback.CAMPAIGN_FIRST_SUCCESS } });
    assert.strictEqual(closed.ok, true); assert.strictEqual(closed.cooldownDays, 30);
    const state = store.read("companies/c1/feedbackState/u1");
    assert.strictEqual(state.dismissals.length, 1); assert.deepStrictEqual(state.events.map((e) => e.name), ["feedback_prompt_shown", "feedback_prompt_dismissed"]);
    nowRef.value += 10 * DAY;
    const out = await fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } });
    assert.strictEqual(out.show, false); assert.strictEqual(out.reason, "dismissed_recently");
    nowRef.value += 21 * DAY;
    assert.strictEqual((await fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } })).show, true, "the cooldown is over");
    await rejects(fns.dismissFeedbackPrompt({ auth: member, data: { companyId: "c1", campaign: "made_up" } }), "invalid-argument");
  });

  await check("a submitted answer is written once with the fields the form asked for, records feedback_submitted, and the campaign is never asked again", async () => {
    const { fns, store, nowRef } = build();
    store.write("siparisler/o1", real("o1"));
    await fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1", shown: feedback.CAMPAIGN_FIRST_SUCCESS } });
    const out = await fns.submitFeedback({ auth: member, data: { companyId: "c1", trigger: "first_success", experience: "difficult", kind: "problem", text: "The order form lost my notes.", page: "/orders", clientKey: "k-1", language: "Türkçe" } });
    assert.strictEqual(out.ok, true); assert.strictEqual(out.duplicate, false); assert.match(out.id, /^fb_/);
    const row = store.read(`feedback/${out.id}`);
    assert.strictEqual(row.companyId, "c1"); assert.strictEqual(row.uid, "u1"); assert.strictEqual(row.userEmail, "owner@acme.test"); assert.strictEqual(row.workspaceName, "Acme Studio");
    assert.strictEqual(row.trigger, "first_success"); assert.strictEqual(row.campaign, feedback.CAMPAIGN_FIRST_SUCCESS); assert.strictEqual(row.stage, "onboarding");
    assert.strictEqual(row.feedbackType, "bug_report"); assert.strictEqual(row.kind, "problem"); assert.strictEqual(row.experience, "difficult"); assert.strictEqual(row.text, "The order form lost my notes.");
    assert.strictEqual(row.status, "new"); assert.strictEqual(row.ownerUid, null); assert.strictEqual(row.platform, "web"); assert.strictEqual(row.page, "/orders"); assert.strictEqual(row.language, "Türkçe");
    // The native apps name themselves; anything else is refused, and no platform at all still means the web.
    for (const [platform, expected] of [["mac", "mac"], ["ios", "ios"], ["android", "android"], ["", "web"], [undefined, "web"]]) {
      const shape = feedback.submissionShape({ experience: "easy", platform });
      assert.deepStrictEqual([shape.ok, shape.value.platform], [true, expected], String(platform));
    }
    const bad = feedback.submissionShape({ experience: "easy", platform: "windows" });
    assert.deepStrictEqual([bad.ok, bad.problems], [false, ["platform"]]);
    assert.deepStrictEqual(row.statusHistory.map((h) => h.status), ["new"]);
    // Nothing the form did not ask for: no customer, order, bank or address fields ride along.
    const allowed = new Set(["id", "companyId", "uid", "userEmail", "workspaceName", "source", "platform", "trigger", "campaign", "stage", "feedbackType", "kind", "experience", "text", "category", "impact", "status", "ownerUid", "adminNote", "page", "language", "createdAtMs", "createdAt", "updatedAtMs", "updatedAt", "statusHistory"]);
    for (const key of Object.keys(row)) assert.ok(allowed.has(key), `unexpected field ${key}`);
    const state = store.read("companies/c1/feedbackState/u1");
    assert.deepStrictEqual(state.done, [feedback.CAMPAIGN_FIRST_SUCCESS]); assert.strictEqual(state.submissions.length, 1);
    assert.deepStrictEqual(state.events.map((e) => e.name), ["feedback_prompt_shown", "feedback_submitted"]);
    assert.ok(!JSON.stringify(state).includes("lost my notes"), "the state document holds a hash, not the words");
    nowRef.value += 40 * DAY;
    const after = await fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } });
    assert.strictEqual(after.show, false); assert.strictEqual(after.reason, "already_answered");
    // A second answer from a card another tab still shows: accepted as a note, but the campaign stays answered once.
    nowRef.value += 60 * 1000;
    const again = await fns.submitFeedback({ auth: member, data: { companyId: "c1", trigger: "first_success", experience: "okay", text: "Second thought: the search is slow." } });
    assert.strictEqual(again.duplicate, false); assert.notStrictEqual(again.id, out.id);
    const later = store.read("companies/c1/feedbackState/u1");
    assert.deepStrictEqual(later.done, [feedback.CAMPAIGN_FIRST_SUCCESS]); assert.strictEqual(later.events.filter((e) => e.name === "feedback_submitted").length, 2);
  });

  await check("a member removed from the workspace after being invited can no longer ask, close or send", async () => {
    const { fns, store } = build();
    store.write("siparisler/o1", real("o1"));
    assert.strictEqual((await fns.getFeedbackPrompt({ auth: second, data: { companyId: "c1" } })).show, true);
    const company = store.read("companies/c1"); delete company.members.u2; store.write("companies/c1", company);
    await rejects(fns.getFeedbackPrompt({ auth: second, data: { companyId: "c1" } }), "permission-denied");
    await rejects(fns.getFeedbackPrompt({ auth: second, data: { companyId: "c1", shown: feedback.CAMPAIGN_FIRST_SUCCESS } }), "permission-denied");
    await rejects(fns.dismissFeedbackPrompt({ auth: second, data: { companyId: "c1" } }), "permission-denied");
    await rejects(fns.submitFeedback({ auth: second, data: { companyId: "c1", experience: "okay", text: "I was removed" } }), "permission-denied");
    assert.strictEqual(store.paths("feedback").length, 0); assert.strictEqual(store.read("companies/c1/feedbackState/u2"), undefined);
  });

  await check("a retry under the same client key, or the same words twice within minutes, finds the earlier note; different words are a new note", async () => {
    const { fns, store, nowRef } = build();
    const first = await fns.submitFeedback({ auth: member, data: { companyId: "c1", experience: "okay", kind: "suggestion", text: "Add dark mode", clientKey: "abc" } });
    const retry = await fns.submitFeedback({ auth: member, data: { companyId: "c1", experience: "okay", kind: "suggestion", text: "Add dark mode", clientKey: "abc" } });
    assert.strictEqual(retry.duplicate, true); assert.strictEqual(retry.id, first.id);
    const doubleClick = await fns.submitFeedback({ auth: member, data: { companyId: "c1", experience: "okay", kind: "suggestion", text: "  add  DARK mode " } });
    assert.strictEqual(doubleClick.duplicate, true); assert.strictEqual(doubleClick.id, first.id);
    nowRef.value += 60 * 1000;
    const different = await fns.submitFeedback({ auth: member, data: { companyId: "c1", experience: "okay", kind: "suggestion", text: "Add light mode" } });
    assert.strictEqual(different.duplicate, false); assert.notStrictEqual(different.id, first.id);
    assert.strictEqual(store.paths("feedback/").length, 2);
  });

  await check("the manual entry is not held back by the prompt's cooldown and does not answer the campaign", async () => {
    const { fns, store } = build();
    store.write("siparisler/o1", real("o1"));
    await fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } });
    await fns.dismissFeedbackPrompt({ auth: member, data: { companyId: "c1" } });
    const out = await fns.submitFeedback({ auth: member, data: { companyId: "c1", trigger: "manual", experience: "easy", kind: "missing_feature", text: "Bulk invoice export" } });
    assert.strictEqual(out.ok, true);
    const row = store.read(`feedback/${out.id}`);
    assert.strictEqual(row.trigger, "manual"); assert.strictEqual(row.campaign, ""); assert.strictEqual(row.stage, "active"); assert.strictEqual(row.feedbackType, "feature_request");
    const noKind = await fns.submitFeedback({ auth: member, data: { companyId: "c1", trigger: "manual", experience: "easy" } });
    assert.strictEqual(store.read(`feedback/${noKind.id}`).feedbackType, "general_feedback");
    assert.deepStrictEqual(store.read("companies/c1/feedbackState/u1").done || [], [], "a manual note is not the prompt's answer");
    const prompt = await fns.getFeedbackPrompt({ auth: member, data: { companyId: "c1" } });
    assert.strictEqual(prompt.reason, "dismissed_recently", "the dismissed prompt stays dismissed");
  });

  await check("a note without the one required answer, with an unknown kind, or too long, is refused", async () => {
    const { fns } = build();
    await rejects(fns.submitFeedback({ auth: member, data: { companyId: "c1", text: "hello" } }), "invalid-argument", /experience/);
    await rejects(fns.submitFeedback({ auth: member, data: { companyId: "c1", experience: "okay", kind: "rant" } }), "invalid-argument", /kind/);
    await rejects(fns.submitFeedback({ auth: member, data: { companyId: "c1", experience: "okay", text: "x".repeat(2001) } }), "invalid-argument", /text_too_long/);
    await rejects(fns.submitFeedback({ auth: member, data: { companyId: "c1", experience: "okay", trigger: "cron" } }), "invalid-argument", /trigger/);
  });

  await check("the abuse limit: the sixth note in an hour is refused", async () => {
    const { fns, nowRef } = build();
    for (let i = 0; i < 5; i += 1) { nowRef.value += 60 * 1000; await fns.submitFeedback({ auth: member, data: { companyId: "c1", experience: "okay", text: `note ${i}` } }); }
    nowRef.value += 60 * 1000;
    await rejects(fns.submitFeedback({ auth: member, data: { companyId: "c1", experience: "okay", text: "note 6" } }), "resource-exhausted");
    nowRef.value += 61 * 60 * 1000;
    assert.strictEqual((await fns.submitFeedback({ auth: member, data: { companyId: "c1", experience: "okay", text: "note 7" } })).ok, true);
  });

  await check("a member of another workspace, or nobody, cannot ask, close or send for this one; only an admin reads the inbox", async () => {
    const { fns, store } = build();
    store.write("siparisler/o1", real("o1"));
    await rejects(fns.getFeedbackPrompt({ auth: stranger, data: { companyId: "c1" } }), "permission-denied");
    await rejects(fns.submitFeedback({ auth: stranger, data: { companyId: "c1", experience: "okay" } }), "permission-denied");
    await rejects(fns.dismissFeedbackPrompt({ auth: stranger, data: { companyId: "c1" } }), "permission-denied");
    await rejects(fns.getFeedbackPrompt({ auth: null, data: { companyId: "c1" } }), "unauthenticated");
    await rejects(fns.listFeedback({ auth: member, data: {} }), "permission-denied");
    await rejects(fns.getFeedbackDetail({ auth: member, data: { id: "fb_anything1" } }), "permission-denied");
    await rejects(fns.updateFeedbackStatus({ auth: member, data: { id: "fb_anything1", status: "closed" } }), "permission-denied");
    const unverified = { uid: "admin1", token: { email: "admin@nivadesk.test", email_verified: false } };
    await rejects(fns.listFeedback({ auth: unverified, data: {} }), "permission-denied");
    assert.strictEqual(store.paths("companies/c1/feedbackState").length, 0);
  });

  await check("the inbox lists newest first with filters, opens a note in full, and a status change is written with its history and owner", async () => {
    const { fns, store, nowRef } = build();
    const a = await fns.submitFeedback({ auth: member, data: { companyId: "c1", experience: "difficult", kind: "problem", text: "Printing an invoice cuts off the totals line." } });
    nowRef.value += 5 * 60 * 1000;
    const b = await fns.submitFeedback({ auth: stranger, data: { companyId: "other", experience: "easy", text: "" } });
    const page = await fns.listFeedback({ auth: adminAuth, data: {} });
    assert.deepStrictEqual(page.rows.map((r) => r.id), [b.id, a.id]);
    assert.strictEqual(page.rows[1].excerpt, "Printing an invoice cuts off the totals line."); assert.strictEqual(page.rows[1].workspaceName, "Acme Studio"); assert.strictEqual(page.rows[1].userEmail, "owner@acme.test");
    assert.strictEqual(page.rows[0].workspaceName, "Other"); assert.strictEqual(page.rows[0].feedbackType, "general_feedback");
    assert.ok(page.statuses.includes("planned") && page.feedbackTypes.includes("bug_report"));
    const bugs = await fns.listFeedback({ auth: adminAuth, data: { feedbackType: "bug_report" } });
    assert.deepStrictEqual(bugs.rows.map((r) => r.id), [a.id]);
    await rejects(fns.listFeedback({ auth: adminAuth, data: { status: "weird" } }), "invalid-argument");
    const detail = await fns.getFeedbackDetail({ auth: adminAuth, data: { id: a.id } });
    assert.strictEqual(detail.feedback.text, "Printing an invoice cuts off the totals line."); assert.strictEqual(detail.feedback.createdAt, undefined, "server timestamps stay out of the answer");
    await rejects(fns.getFeedbackDetail({ auth: adminAuth, data: { id: "fb_missing12" } }), "not-found");
    await rejects(fns.getFeedbackDetail({ auth: adminAuth, data: { id: "../x" } }), "invalid-argument");
    nowRef.value += 60 * 1000;
    const changed = await fns.updateFeedbackStatus({ auth: adminAuth, data: { id: a.id, status: "reviewing", adminNote: "Reproduced on A4." } });
    assert.strictEqual(changed.feedback.status, "reviewing"); assert.strictEqual(changed.feedback.ownerUid, "admin1"); assert.strictEqual(changed.feedback.adminNote, "Reproduced on A4.");
    assert.deepStrictEqual(changed.feedback.statusHistory.map((h) => h.status), ["new", "reviewing"]);
    const reviewing = await fns.listFeedback({ auth: adminAuth, data: { status: "reviewing" } });
    assert.deepStrictEqual(reviewing.rows.map((r) => r.id), [a.id]);
    const same = await fns.updateFeedbackStatus({ auth: adminAuth, data: { id: a.id, status: "reviewing" } });
    assert.strictEqual(same.feedback.statusHistory.length, 2, "an unchanged status adds no history");
    await rejects(fns.updateFeedbackStatus({ auth: adminAuth, data: { id: a.id, status: "done" } }), "invalid-argument");
    assert.strictEqual(store.read(`feedback/${a.id}`).status, "reviewing");
  });

  await check("the pure eligibility rule, on its own: every refusal has a name, in order; the caps come from messaging.js", async () => {
    const now = Date.parse("2026-09-10T12:00:00.000Z");
    const ok = { nowMs: now, enabled: true, pilotAllowed: true, inviteFromMs: LAUNCH_MS, firstSuccess: { state: "substantive", known: true, atMs: LAUNCH_MS + DAY } };
    assert.strictEqual(feedback.promptEligibility({ ...ok, enabled: false }).reason, "feature_off");
    assert.strictEqual(feedback.promptEligibility({ ...ok, pilotAllowed: false }).reason, "not_in_pilot");
    assert.strictEqual(feedback.promptEligibility({ ...ok, nowMs: 0 }).reason, "no_clock");
    assert.strictEqual(feedback.promptEligibility({ ...ok, firstSuccess: { state: "none" } }).reason, "no_first_success");
    assert.strictEqual(feedback.promptEligibility({ ...ok, firstSuccess: { state: "shell" } }).reason, "first_order_is_shell");
    assert.strictEqual(feedback.promptEligibility({ ...ok, inviteFromMs: 0 }).reason, "invite_window_unset");
    assert.strictEqual(feedback.promptEligibility({ ...ok, firstSuccess: { state: "substantive", known: false, atMs: 0 } }).reason, "first_success_time_unknown");
    assert.strictEqual(feedback.promptEligibility({ ...ok, firstSuccess: { state: "substantive", known: true, atMs: LAUNCH_MS - 1 } }).reason, "first_success_before_launch");
    assert.strictEqual(feedback.promptEligibility({ ...ok, state: { done: [feedback.CAMPAIGN_FIRST_SUCCESS] } }).reason, "already_answered");
    assert.strictEqual(feedback.promptEligibility({ ...ok, state: {} }).show, true);
    assert.strictEqual(feedback.promptEligibility({ ...ok, state: { shows: [{ campaign: feedback.CAMPAIGN_FIRST_SUCCESS, atMs: now - DAY }] } }).reason, "already_sent");
    assert.strictEqual(feedback.promptEligibility({ ...ok, state: { shows: [{ campaign: feedback.CAMPAIGN_FIRST_SUCCESS, atMs: now - 8 * DAY }] } }).show, true);
    assert.strictEqual(feedback.promptEligibility({ ...ok, state: { dismissals: [{ campaign: feedback.CAMPAIGN_FIRST_SUCCESS, atMs: now - 29 * DAY }] } }).reason, "dismissed_recently");
    assert.strictEqual(feedback.promptEligibility({ ...ok, state: { dismissals: [{ campaign: feedback.CAMPAIGN_FIRST_SUCCESS, atMs: now - 31 * DAY }] } }).show, true);
    assert.strictEqual(feedback.pilotAllows("", "c1"), false); assert.strictEqual(feedback.pilotAllows("*", "c1"), true); assert.strictEqual(feedback.pilotAllows("a, c1 ,b", "c1"), true); assert.strictEqual(feedback.pilotAllows("c10", "c1"), false);
    assert.strictEqual(feedback.creationStampOf({ paymentDate: "2026-09-10T10:00:00.000Z" }), 0, "paymentDate is never a creation stamp");
    assert.strictEqual(feedback.rateLimitVerdict(Array.from({ length: 20 }, (_, i) => ({ atMs: now - i * 60 * 60 * 1000 })), now).reason, "too_many_today");
    assert.strictEqual(feedback.feedbackTypeFor("first_success", ""), "onboarding_effort"); assert.strictEqual(feedback.feedbackTypeFor("manual", ""), "general_feedback");
  });

  console.log(failures === 0 ? "\n✅ FEEDBACK GEÇTİ" : `\n❌ FEEDBACK: ${failures} failing`);
  process.exit(failures === 0 ? 0 : 1);
})();
