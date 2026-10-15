/**
 * Review 10–11 Oct, N08 + N17 (15 Oct 2026). Imports the real tables — no copies.
 *
 * N08: "Create your first order", "Send your first estimate", "Add a customer"
 *      and Getting started's add-an-order / add-a-customer steps landed on an
 *      empty list and waited for a second press. They open the create form now
 *      (/orders?new=1 → Quick Create, /customers?new=1 → customer form), while
 *      "Open my workspace" still lands on the page without opening a form.
 * N17: Home "View all activity" linked to /orders; it opens the Activity
 *      centre, as Mac and iPhone do.
 *
 * Run: npx tsx scripts/check-review-links.ts
 * (Importing the onboarding table loads lib/firebase/client.ts, which only
 * needs a non-empty demo config to initialise; nothing is called.)
 */
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||= "demo-not-a-real-key";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||= "demo-review-links";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||= "demo-review-links.firebaseapp.com";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||= "1:0:web:demo";

let failures = 0;
function check(name: string, run: () => void) {
  try {
    run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${(error as Error).message.split("\n")[0]}`);
  }
}

(async () => {
  const wizard = await import("../lib/studioflow/onboardingWizard");
  const checklist = await import("../lib/studioflow/setupChecklist");
  const homeCards = await import("../lib/studioflow/homeCards");

  const tasks = wizard.ONBOARDING_GOAL_TASKS as Record<string, Array<{ label: string; href: string }>>;
  const hrefOf = (goal: string, label: string) => tasks[goal]?.find(task => task.label === label)?.href;

  for (const [goal, label] of [
    ["orders_customers", "Create your first order"],
    ["other", "Create your first order"],
    ["estimates", "Send your first estimate"],
    ["repairs_service", "Open a repair intake"],
  ] as const) {
    check(`N08 ${goal} · "${label}" opens Quick Create`, () => assert.equal(hrefOf(goal, label), "/orders?new=1"));
  }
  for (const goal of ["orders_customers", "other"]) {
    check(`N08 ${goal} · "Add a customer" opens the customer form`, () => assert.equal(hrefOf(goal, "Add a customer"), "/customers?new=1"));
  }
  check("N08 Getting started add-order / add-customer steps open their forms", () => {
    assert.equal(checklist.SETUP_STEP_HREFS.new_order, "/orders?new=1");
    assert.equal(checklist.SETUP_STEP_HREFS.new_customer, "/customers?new=1");
  });
  check("N08 'Open my workspace' lands on the page without opening the form", () => {
    const fn = (wizard as Record<string, unknown>).onboardingWorkspaceHref as ((href?: string) => string | undefined) | undefined;
    assert.equal(typeof fn, "function", "onboardingWorkspaceHref is exported");
    assert.equal(fn!("/orders?new=1"), "/orders");
    assert.equal(fn!("/customers?new=1&x=2"), "/customers?x=2");
    assert.equal(fn!("/settings?section=workflow"), "/settings?section=workflow");
  });

  check("N17 Home 'View all activity' opens the Activity centre, not /orders", () => {
    const card = homeCards.HOME_CARDS.find(item => item.id === "recentActivity") as Record<string, unknown> | undefined;
    assert.ok(card, "recentActivity card exists");
    assert.equal(card!.opens, "activity");
    assert.equal(typeof (homeCards as Record<string, unknown>).openActivityCentre, "function");
  });

  if (failures) {
    console.log(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall review link checks passed");
  process.exit(0);
})();
