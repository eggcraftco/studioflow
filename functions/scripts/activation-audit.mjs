// How many people who signed up ever started using it.
//
// Measured once, on 23 Aug 2026: 37 external workspaces, 0 customer records
// created, 0 paid. That number then sat unrepeated for eight days while every
// decision about what to build next leaned on it, because the script was never
// committed. This is that script, committed.
//
// READ ONLY. It opens production with Application Default Credentials and never
// writes. It prints counts and cohorts — no names, no emails, no order data —
// so the output is safe to paste anywhere.
//
//   node functions/scripts/activation-audit.mjs
//   node functions/scripts/activation-audit.mjs --since 2026-08-23
//
import admin from "firebase-admin";

const args = process.argv.slice(2);
const sinceArg = (() => {
  const i = args.indexOf("--since");
  return i >= 0 && args[i + 1] ? new Date(args[i + 1]) : null;
})();

// Pointing an audit at the emulator by accident and reading "0 paid" off an
// empty database is a very easy way to be confidently wrong, so it has to be
// asked for out loud.
const useEmulator = args.includes("--emulator");
if (process.env.FIRESTORE_EMULATOR_HOST && !useEmulator) {
  console.error("FIRESTORE_EMULATOR_HOST is set — this audit reads production. Unset it, or pass --emulator if you meant it.");
  process.exit(1);
}
if (useEmulator && !process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
}

admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "eggcraft-studio" });
const db = admin.firestore();

// Ours, not theirs. These skew every number they appear in.
const OUR_EMAILS = new Set(["contact@eggcraft.co.uk", "gunesgocmen@gmail.com", "review@nivadesk.app"]);
const OUR_DOMAINS = ["@eggcraft.co.uk", "@nivadesk.app", "@nivadesk.co.uk"];
function isOurs(email = "") {
  const value = String(email || "").trim().toLowerCase();
  if (!value) return false;
  if (OUR_EMAILS.has(value)) return true;
  return OUR_DOMAINS.some((domain) => value.endsWith(domain));
}

const millis = (value) => {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

// Paid means money arrived, which is not the same as "is on a paid plan".
// A lifetime purchase carries no subscription status at all; a subscription
// that has been cancelled still says pro right up until it lapses; past_due
// means they DID pay and a renewal has just failed, which is a customer, not a
// prospect. Getting this wrong in the generous direction is the easiest way to
// report a conversion rate that is not real.
const SUBSCRIPTION_PLANS = new Set(["starter", "pro", "team"]);
const LIFETIME_PLANS = new Set(["lifetime_lite", "lifetime_pro", "lifetime_team"]);
const PAYING_STATUSES = new Set(["active", "past_due"]);
const isPaid = (data) => {
  const plan = String(data.plan || "").trim().toLowerCase();
  const status = String(data.subscriptionStatus || "").trim().toLowerCase();
  if (LIFETIME_PLANS.has(plan)) return true;
  return SUBSCRIPTION_PLANS.has(plan) && PAYING_STATUSES.has(status);
};

// One count per workspace rather than one read per workspace per collection:
// count() is an aggregation query and does not pull the documents.
async function countIn(collection, companyId) {
  try {
    const snap = await db.collection(collection).where("companyId", "==", companyId).count().get();
    return Number(snap.data().count || 0);
  } catch {
    return -1;
  }
}
async function countSub(companyId, sub) {
  try {
    const snap = await db.collection("companies").doc(companyId).collection(sub).count().get();
    return Number(snap.data().count || 0);
  } catch {
    return -1;
  }
}

(async () => {
  const companies = await db.collection("companies").get();
  const rows = [];

  for (const doc of companies.docs) {
    const data = doc.data() || {};
    if (isOurs(data.ownerEmail)) continue;
    const createdMs = millis(data.createdAt) || millis(data.signupCompletedAt);
    if (sinceArg && createdMs && createdMs < sinceArg.getTime()) continue;

    const [orders, customers, inventory] = await Promise.all([
      countIn("siparisler", doc.id),
      countIn("musteriler", doc.id),
      countSub(doc.id, "inventoryItems")
    ]);

    rows.push({
      createdMs,
      // Onboarding writes these; their absence means the wizard was never finished.
      onboarded: Boolean(data.onboardingTeamSize || data.businessType),
      orders, customers, inventory,
      plan: String(data.plan || "").trim().toLowerCase() || "(none)",
      status: String(data.subscriptionStatus || "").trim().toLowerCase() || "(none)",
      paid: isPaid(data),
      members: Array.isArray(data.memberUids) ? data.memberUids.length : 1
    });
  }

  rows.sort((a, b) => a.createdMs - b.createdMs);

  const total = rows.length;
  const withOrders = rows.filter((r) => r.orders > 0).length;
  const withCustomers = rows.filter((r) => r.customers > 0).length;
  const withInventory = rows.filter((r) => r.inventory > 0).length;
  const onboarded = rows.filter((r) => r.onboarded).length;
  const invited = rows.filter((r) => r.members > 1).length;
  const paid = rows.filter((r) => r.paid).length;
  const doneAnything = rows.filter((r) => r.orders > 0 || r.customers > 0 || r.inventory > 0).length;

  const pct = (n) => (total ? `${Math.round((n / total) * 1000) / 10}%` : "—");
  const line = (label, n) => console.log(`  ${label.padEnd(34)} ${String(n).padStart(4)}   ${pct(n).padStart(6)}`);

  console.log(`\nExternal workspaces${sinceArg ? ` created since ${sinceArg.toISOString().slice(0, 10)}` : ""}: ${total}`);
  console.log("  (ours excluded by owner email domain)\n");
  line("finished onboarding", onboarded);
  line("created at least one order", withOrders);
  line("created at least one customer", withCustomers);
  line("added at least one stock item", withInventory);
  line("did ANY of the three", doneAnything);
  line("invited a colleague", invited);
  line("on a paid plan", paid);

  // The funnel only means something as a sequence.
  console.log("\nThe drop:");
  console.log(`  signed up            ${total}`);
  console.log(`  → onboarded          ${onboarded}`);
  console.log(`  → did something      ${doneAnything}`);
  console.log(`  → paid               ${paid}`);

  // Cohorts, so "did the first-run work help" is answerable rather than guessed.
  const cut = Date.UTC(2026, 7, 23);
  const before = rows.filter((r) => r.createdMs && r.createdMs < cut);
  const after = rows.filter((r) => r.createdMs && r.createdMs >= cut);
  const cohort = (label, set) => {
    if (!set.length) { console.log(`  ${label.padEnd(22)} (none)`); return; }
    const active = set.filter((r) => r.orders > 0 || r.customers > 0 || r.inventory > 0).length;
    const ob = set.filter((r) => r.onboarded).length;
    console.log(`  ${label.padEnd(22)} ${String(set.length).padStart(3)} signed up · ${String(ob).padStart(3)} onboarded · ${String(active).padStart(3)} active · ${Math.round((active / set.length) * 100)}%`);
  };
  console.log("\nBefore and after 23 Aug (the day the first measurement was taken):");
  cohort("up to 23 Aug", before);
  cohort("23 Aug onwards", after);

  const plans = {};
  for (const r of rows) plans[`${r.plan}/${r.status}`] = (plans[`${r.plan}/${r.status}`] || 0) + 1;
  console.log("\nPlan and status:");
  for (const [key, n] of Object.entries(plans).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key.padEnd(34)} ${String(n).padStart(4)}`);
  }
  console.log("");
  process.exit(0);
})().catch((error) => {
  console.error("audit failed:", error?.message || error);
  process.exit(1);
});
