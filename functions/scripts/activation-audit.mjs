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
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// index.js is required for ONE function: the real plan resolver. Reimplementing
// it here is what produced this audit's first result — "0 paid" across 47
// workspaces, measured against a `plan` field that does not exist. The document
// stores billingPlan and billingStatus, and an expired trial silently falls
// back to demo. Requiring index.js also initialises firebase-admin, so this
// file must not initialise it again.
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || `{"projectId":"${process.env.GCLOUD_PROJECT}"}`;
const admin = require("firebase-admin");

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

const { _billingPlanFromCompanyData: billingPlanFor } = require("../index.js");
if (typeof billingPlanFor !== "function") {
  console.error("index.js did not export _billingPlanFromCompanyData — refusing to guess the plan field.");
  process.exit(1);
}
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

// Paid means money arrived. There are exactly four plans — demo,
// lifetime_lite, pro_monthly, team_monthly — and despite the name NONE of them
// is a one-time purchase: lifetime_lite's displayName is "NivaDesk Starter" and
// the prefix is historical. An earlier version of this check treated every
// lifetime_* plan as paid regardless of status and duly reported a trialing
// Starter workspace as a paying customer.
//
// Trialing is not paying. Every new workspace is granted pro_monthly/trialing
// at signup (trialGrantAtSignup), so counting trials as revenue would report a
// conversion rate identical to the signup rate. past_due IS paying: they paid
// and a renewal has just failed. The plan comes from the server's own resolver,
// so a trial that has run out already reads demo.
const PAYING_STATUSES = new Set(["active", "past_due"]);
const isPaid = (data) => {
  const plan = billingPlanFor(data);
  if (plan === "demo") return false;
  return PAYING_STATUSES.has(String(data.billingStatus || "").trim().toLowerCase());
};
const isTrialing = (data) => {
  const plan = billingPlanFor(data);
  return plan !== "demo" && String(data.billingStatus || "").trim().toLowerCase() === "trialing";
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

    // Our own test signups do not use our domains — roletest123, test8 and the
    // rest were made with ordinary addresses. They cannot be excluded safely
    // (a real jeweller may well have "studio" in their address), so they are
    // counted and flagged rather than quietly dropped.
    const email = String(data.ownerEmail || "").toLowerCase();
    const looksLikeTest = /test|demo|qa|example|sample|deneme/.test(email);

    rows.push({
      createdMs, looksLikeTest,
      // Onboarding writes these; their absence means the wizard was never finished.
      onboarded: Boolean(data.onboardingTeamSize || data.businessType),
      orders, customers, inventory,
      // The resolved plan, not the raw field: a trial that ran out reads demo.
      plan: billingPlanFor(data),
      rawPlan: String(data.billingPlan || "").trim().toLowerCase() || "(none)",
      status: String(data.billingStatus || "").trim().toLowerCase() || "(none)",
      paid: isPaid(data),
      trialing: isTrialing(data),
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
  const trialing = rows.filter((r) => r.trialing).length;
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
  const suspicious = rows.filter((r) => r.looksLikeTest).length;
  if (suspicious) line("...of which look like test signups", suspicious);
  line("on a trial right now", trialing);
  line("PAYING", paid);

  // The funnel only means something as a sequence.
  console.log("\nThe drop:");
  console.log(`  signed up            ${total}`);
  console.log(`  → onboarded          ${onboarded}`);
  console.log(`  → did something      ${doneAnything}`);
  console.log(`  → trialing           ${trialing}`);
  console.log(`  → paying             ${paid}`);

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
  for (const r of rows) {
    const label = r.plan === r.rawPlan ? `${r.plan}/${r.status}` : `${r.plan}/${r.status}  (stored ${r.rawPlan})`;
    plans[label] = (plans[label] || 0) + 1;
  }
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
