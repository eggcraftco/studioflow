// Whether a message may be sent, and why not.
//
// The most damaging thing a lifecycle system does is not failing to send. It is
// sending "Connect your first store" the morning after somebody connected their
// store — which tells them, unmistakably, that the product is not paying
// attention, and undoes every good message before it. The specification makes
// cancelling that mandatory, and this file is what holds it.
const assert = require("assert");
const {
  messageDecision, goalAlreadyMet, isTransactional,
  CAMPAIGN_GOALS, DEFAULT_MESSAGE_CAPS
} = require("../../lifecycle/messaging");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 4, 10, 0, 0);
const ask = (request = {}, context = {}) =>
  messageDecision({ campaign: "connect_first_store", channel: "in_app", nowMs: NOW, ...request }, context);

// ---- the rule that matters most ---------------------------------------------

check("a message asking for something already done is cancelled", () => {
  const done = ["integration_connected"];
  const decision = ask({}, { doneEventNames: done });
  assert.strictEqual(decision.send, false, '"Connect your first store" would have gone to somebody who just did');
  assert.strictEqual(decision.reason, "goal_already_met");
});

check("and the same message still goes to somebody who has not", () => {
  assert.deepStrictEqual(ask({}, { doneEventNames: ["page_viewed"] }), { send: true, reason: "" });
  assert.deepStrictEqual(ask({}, {}), { send: true, reason: "" });
});

check("every campaign that asks for an action knows which action", () => {
  for (const [campaign, events] of Object.entries(CAMPAIGN_GOALS)) {
    assert.ok(Array.isArray(events) && events.length, `${campaign} names no event that would satisfy it`);
    assert.ok(goalAlreadyMet(campaign, events), `${campaign} is not cancelled by its own goal event`);
    assert.strictEqual(goalAlreadyMet(campaign, []), false, campaign);
  }
});

check("a campaign that asks for either of two things is satisfied by either", () => {
  // A first order can arrive from a shop or be typed by hand; both are the
  // thing the message was asking for.
  assert.strictEqual(goalAlreadyMet("create_first_order", ["order_created"]), true);
  assert.strictEqual(goalAlreadyMet("create_first_order", ["external_order_imported"]), true);
  assert.strictEqual(goalAlreadyMet("create_first_order", ["customer_created"]), false);
});

check("a campaign nobody has described is never cancelled by a guess", () => {
  assert.strictEqual(goalAlreadyMet("some_new_campaign", ["integration_connected"]), false);
  assert.strictEqual(goalAlreadyMet("", ["integration_connected"]), false);
  assert.strictEqual(goalAlreadyMet("constructor", ["integration_connected"]), false);
});

// ---- what is never suppressed ------------------------------------------------

check("a transactional message goes out whatever else has happened", () => {
  // A password reset held back because somebody had two onboarding tips today
  // is a support incident, not a courtesy.
  const buried = {
    unsubscribed: true,
    doneEventNames: ["integration_connected"],
    history: [
      { campaign: "a", channel: "in_app", atMs: NOW - 1000 },
      { campaign: "b", channel: "in_app", atMs: NOW - 2000 },
      { campaign: "connect_first_store", channel: "in_app", atMs: NOW - 3000 }
    ]
  };
  for (const kind of ["transactional", "support", "security", "billing", "SUPPORT"]) {
    assert.deepStrictEqual(ask({ kind }, buried), { send: true, reason: "" }, kind);
  }
  assert.strictEqual(isTransactional("marketing"), false);
  assert.strictEqual(isTransactional(""), false);
});

check("somebody who unsubscribed gets nothing that is not transactional", () => {
  assert.strictEqual(ask({}, { unsubscribed: true }).reason, "unsubscribed");
});

// ---- the caps ------------------------------------------------------------------

check("two in-app messages a day, and the third waits", () => {
  const history = [
    { campaign: "a", channel: "in_app", atMs: NOW - 2 * 60 * 60 * 1000 },
    { campaign: "b", channel: "in_app", atMs: NOW - 4 * 60 * 60 * 1000 }
  ];
  assert.strictEqual(ask({}, { history }).reason, "in_app_daily_cap");
  // Yesterday's two do not count against today.
  const yesterday = history.map((entry) => ({ ...entry, atMs: entry.atMs - 2 * DAY }));
  assert.strictEqual(ask({}, { history: yesterday }).send, true);
});

check("one email in forty-eight hours", () => {
  const history = [{ campaign: "a", channel: "email", atMs: NOW - 12 * 60 * 60 * 1000 }];
  assert.strictEqual(ask({ channel: "email" }, { history }).reason, "email_48h_cap");
  const older = [{ campaign: "a", channel: "email", atMs: NOW - 3 * DAY }];
  assert.strictEqual(ask({ channel: "email" }, { history: older }).send, true);
  // An email does not spend the in-app allowance, or the other way round.
  assert.strictEqual(ask({ channel: "in_app" }, { history }).send, true);
});

check("one feedback prompt a week, whatever it is called", () => {
  const history = [{ campaign: "how_is_it_going", kind: "feedback_prompt", channel: "in_app", atMs: NOW - 3 * DAY }];
  assert.strictEqual(ask({ campaign: "rate_your_first_order", kind: "feedback_prompt" }, { history }).reason, "feedback_prompt_cap");
  const older = [{ ...history[0], atMs: NOW - 9 * DAY }];
  assert.strictEqual(ask({ campaign: "rate_your_first_order", kind: "feedback_prompt" }, { history: older }).send, true);
});

check("the founder writes once", () => {
  const history = [{ campaign: "founder_intro", channel: "email", atMs: NOW - 60 * DAY }];
  assert.strictEqual(ask({ campaign: "founder_intro", channel: "email" }, { history }).send, false);
});

check("the same message is not sent twice", () => {
  const history = [{ campaign: "connect_first_store", channel: "in_app", atMs: NOW - 10 * DAY }];
  assert.strictEqual(ask({}, { history }).reason, "already_sent");
  // A different channel is a different message, and is allowed once.
  assert.strictEqual(ask({ channel: "email" }, { history }).send, true);
});

check("a prompt somebody closed stays closed, and then comes back", () => {
  const dismissals = [{ campaign: "connect_first_store", atMs: NOW - 5 * DAY }];
  assert.strictEqual(ask({}, { dismissals }).reason, "dismissed_recently");
  const old = [{ campaign: "connect_first_store", atMs: NOW - 40 * DAY }];
  assert.strictEqual(ask({}, { dismissals: old }).send, true);
  // Closing one prompt does not silence a different one.
  assert.strictEqual(ask({ campaign: "connect_bank" }, { dismissals }).send, true);
});

check("the caps are configuration, not constants buried in a sender", () => {
  const history = [
    { campaign: "a", channel: "in_app", atMs: NOW - 1000 },
    { campaign: "b", channel: "in_app", atMs: NOW - 2000 }
  ];
  assert.strictEqual(ask({}, { history }).reason, "in_app_daily_cap");
  assert.strictEqual(ask({}, { history, caps: { onboardingInAppMaxPerDay: 5 } }).send, true);
  assert.ok(DEFAULT_MESSAGE_CAPS.onboardingInAppMaxPerDay >= 1);
});

// ---- refusing to guess ---------------------------------------------------------

check("a message with no campaign or no clock is refused rather than sent blind", () => {
  assert.strictEqual(messageDecision({ campaign: "", nowMs: NOW }).reason, "no_campaign");
  assert.strictEqual(messageDecision({ campaign: "connect_bank" }).reason, "no_clock");
  assert.strictEqual(messageDecision({ campaign: "connect_bank", nowMs: 0 }).reason, "no_clock");
  assert.strictEqual(messageDecision({ campaign: "connect_bank", nowMs: NaN }).reason, "no_clock");
});

check("a history entry with a broken time cannot spend an allowance", () => {
  const history = [
    { campaign: "a", channel: "in_app", atMs: null },
    { campaign: "b", channel: "in_app", atMs: "yesterday" },
    { campaign: "c", channel: "in_app", atMs: NOW + 5 * DAY }
  ];
  assert.strictEqual(ask({}, { history }).send, true, "a message dated in the future or not at all spent today's allowance");
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log("PASS ", name); }
    catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 220)); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ LIFECYCLE MESSAGING GEÇTİ");
})();
