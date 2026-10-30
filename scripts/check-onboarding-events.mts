// Onboarding telemetry (30 Oct 2026): the browser-side rules in lib/studioflow/onboardingEventRules.ts,
// and the wiring that sends a new account's setup steps, sections and errors to recordOnboardingEvents.
//   node scripts/check-onboarding-events.mts
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { inRecordingWindow, onboardingEventKey, screenForPath, errorCodeOf, RECORD_WINDOW_DAYS } from "../lib/studioflow/onboardingEventRules.ts";

let failures = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL ${name} — ${(error as Error).message.split("\n")[0]}`); }
};
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-30T12:00:00Z");

check("only an account's first 30 days are sent, by Auth's own creation time", () => {
  assert.strictEqual(RECORD_WINDOW_DAYS, 30);
  assert.strictEqual(inRecordingWindow(new Date(NOW - 29 * DAY).toUTCString(), NOW), true);
  assert.strictEqual(inRecordingWindow(new Date(NOW - 31 * DAY).toUTCString(), NOW), false);
  assert.strictEqual(inRecordingWindow(undefined, NOW), false);
  assert.strictEqual(inRecordingWindow("not a date", NOW), false);
});

check("a section name, never a path: ids and searches stay in the browser", () => {
  assert.strictEqual(screenForPath("/orders?orderId=abc123&q=jane"), "orders");
  assert.strictEqual(screenForPath("/customers/abc123"), "customers");
  assert.strictEqual(screenForPath("/home"), "dashboard");
  assert.strictEqual(screenForPath("/plan"), "plans");
  assert.strictEqual(screenForPath("/somewhere-new"), "other");
  for (const path of ["/", "/admin", "/login", "/signup", "/pricing", "/privacy", "/invite/x", "/p/abc"]) {
    assert.strictEqual(screenForPath(path), "", path);
  }
});

check("the same happening is one send per tab; the daily ones again on a new day", () => {
  const screen = { name: "screen_viewed" as const, props: { screen: "orders" } };
  assert.strictEqual(onboardingEventKey(screen, NOW), onboardingEventKey(screen, NOW + 60_000));
  assert.notStrictEqual(onboardingEventKey(screen, NOW), onboardingEventKey(screen, NOW + DAY));
  const step = { name: "setup_step_viewed" as const, props: { step: "goal" } };
  assert.strictEqual(onboardingEventKey(step, NOW), onboardingEventKey(step, NOW + 3 * DAY));
});

check("an error is sent as its code, never its message", () => {
  assert.strictEqual(errorCodeOf({ code: "functions/unavailable", message: "Jane Smith's order failed" }), "functions/unavailable");
  assert.strictEqual(errorCodeOf(new Error("Could not save Jane")), "unknown");
  assert.strictEqual(errorCodeOf({ code: "Has Spaces And Names" }), "unknown");
});

check("the sender: one callable, nothing awaited by the caller, switched off when the server does not know it", () => {
  const src = read("lib/studioflow/onboardingEvents.ts");
  assert.ok(src.includes('"recordOnboardingEvents"'));
  assert.ok(/not-found\|unimplemented\|permission-denied\|unauthenticated/.test(src), "stops on a missing callable");
  assert.ok(src.includes('platform: "web"'));
  assert.ok(!/pathname|location\.href|email/.test(src), "never reads a path, URL or email");
});

check("wired: app opened + section in AppShell, every setup step, finish and its failure, shop connect", () => {
  const shell = read("components/AppShell.tsx");
  assert.ok(shell.includes('trackOnboarding("app_opened")'));
  assert.ok(shell.includes('trackOnboarding("screen_viewed", { screen })') && shell.includes("screenForPath(pathname)"));
  assert.ok(shell.includes('trackOnboarding("setup_finished"'));
  assert.ok(shell.includes('trackOnboarding("error_shown", { where: "setup_save"'));
  assert.ok(shell.includes('trackOnboarding("store_connect_started"'));
  const wizard = read("components/OnboardingWizard.tsx");
  assert.ok(wizard.includes('trackOnboarding("setup_step_viewed", { step: stepKey })'));
  assert.ok(wizard.includes('trackOnboarding("setup_step_viewed", { step: "ready" })'));
});

check("wired: the one create-order funnel and the Stripe checkout", () => {
  const orders = read("lib/studioflow/orders.ts");
  assert.ok(orders.includes('trackOnboarding("order_form_opened", { via: "new_order" })'));
  assert.ok(orders.includes('trackOnboarding("error_shown", { where: "order_create", code: errorCodeOf(error) })'));
  const billing = read("lib/studioflow/billingActions.ts");
  assert.ok(billing.includes('trackOnboarding("checkout_started", { rail: "stripe" })'));
});

check("admin: a Drop-off page under Customers that reads getOnboardingFunnel", () => {
  const hub = read("components/AdminInsightsHub.tsx");
  assert.ok(hub.includes('{ id: "dropoff", label: "Drop-off" }'));
  assert.ok(hub.includes('page === "dropoff"'));
  const panel = read("components/AdminDropoffPanel.tsx");
  assert.ok(panel.includes('"getOnboardingFunnel"'));
  assert.ok(!/\.email\b|userEmail|ownerEmail/.test(panel), "the page shows no emails");
});

if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log("\nonboarding events: all pass");
