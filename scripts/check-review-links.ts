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
  const homeCards = await import("../lib/studioflow/homeCards");

  // N08's starting tasks ("Your workspace is ready" + three numbered tasks) and the
  // Getting started steps were removed on 7 Nov 2026 (the owner took every
  // informational step-by-step screen out); this keeps them from coming back.
  check("N08 the wizard no longer carries a starting-task list or its landing helper", () => {
    const exported = wizard as Record<string, unknown>;
    assert.equal(exported.ONBOARDING_GOAL_TASKS, undefined);
    assert.equal(exported.onboardingWorkspaceHref, undefined);
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
