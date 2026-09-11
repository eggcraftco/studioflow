// READ-ONLY dry run, 11 Sep: the activation funnel derived two ways for every workspace —
// OLD = derive.js at the deploy tip 8bd71b57 (extracted copy), NEW = derive.js on the candidate branch.
// Same scope as the 10 Sep run: every company (limit 500), "external" = not in OUR. No writes.
import { createRequire } from "node:module";
const require = createRequire("/Users/gocmen/Developer/studioflow-app/functions/package.json");
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "eggcraft-studio" });
const db = admin.firestore();
const S = process.env.S;
const oldDerive = require(S + "/old-tree/functions/lifecycle/derive.js");
const newDerive = require("/Users/gocmen/Developer/studioflow-app/functions/lifecycle/derive.js");
const activation = require("/Users/gocmen/Developer/studioflow-app/functions/lifecycle/activation.js");
const substantive = require("/Users/gocmen/Developer/studioflow-app/functions/lifecycle/substantiveOrder.js");
const nowMs = Date.now();
const OUR = new Set(["KSQidetb3oOSItE9amLISf9Lh6h2"]);            // unchanged scope rule from the 10 Sep run
const KNOWN_OURS = { GuglEFKSEKNTq1xibFpJav3EWkY2: "test (feedback/eBay pilot workspace)", iZFBJqrTJfUBVPA4BgKyvg9zV9o1: "EGGcraft (our company)" };
const companies = await db.collection("companies").limit(500).get();
const rows = [];
for (const c of companies.docs) {
  const companyId = c.id; const cdata = c.data() || {};
  const [settingsSnap, orders, customers, banks, accounting, inventory] = await Promise.all([
    db.collection("companySettings").doc(companyId).get(),
    db.collection("siparisler").where("companyId", "==", companyId).limit(400).get(),
    db.collection("musteriler").where("companyId", "==", companyId).limit(400).get(),
    db.collection("companies").doc(companyId).collection("bankConnections").limit(20).get(),
    db.collection("companies").doc(companyId).collection("accountingConnections").limit(20).get(),
    db.collection("companies").doc(companyId).collection("inventoryItems").limit(400).get().catch(() => ({ docs: [] }))
  ]);
  const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
  const snapshot = {
    settings,
    orders: orders.docs.map((d) => ({ id: d.id, ...d.data() })),
    customers: customers.docs.map((d) => ({ id: d.id, ...d.data() })),
    bankConnections: banks.docs.map((d) => ({ id: d.id, ...d.data() })),
    accountingConnections: accounting.docs.map((d) => ({ id: d.id, ...d.data() })),
    inventoryItems: (inventory.docs || []).map((d) => ({ id: d.id, ...d.data() }))
  };
  const path = activation.activationPathFor(settings);
  const run = (derive) => { const { events } = derive.deriveEvents(snapshot); const st = activation.lifecycleState({ events, path, nowMs }); return { activated: !!st.progress.activated, state: st.state, reason: st.reason || "" }; };
  const fo = substantive.firstOrderProgress(snapshot.orders);
  const name = String(cdata.name || "");
  rows.push({ companyId, name, ours: OUR.has(companyId), knownOurs: KNOWN_OURS[companyId] || (/\b(test|demo|qa)\b/i.test(name) ? `name looks like a test workspace ("${name}")` : ""), path, orders: snapshot.orders.length, shells: snapshot.orders.filter(substantive.isShellOrder).length, substantive: snapshot.orders.filter(substantive.isSubstantiveOrder).length, firstOrder: fo.state, old: run(oldDerive), new: run(newDerive) });
}
const ext = rows.filter((r) => !r.ours);
const n = (list, f) => list.filter(f).length;
console.log("workspaces read:", rows.length, "| external (not in OUR):", ext.length, "| OUR excluded:", rows.length - ext.length);
console.log("activated OLD:", n(ext, (r) => r.old.activated), "| activated NEW:", n(ext, (r) => r.new.activated));
const a2i = ext.filter((r) => r.old.activated && !r.new.activated), i2a = ext.filter((r) => !r.old.activated && r.new.activated);
console.log("active → inactive:", a2i.length, "| inactive → active:", i2a.length, "| net:", n(ext, (r) => r.new.activated) - n(ext, (r) => r.old.activated));
const stateFlips = ext.filter((r) => r.old.state !== r.new.state);
console.log("state changes (any):", stateFlips.length, "| of which activation unchanged (relabel only):", n(stateFlips, (r) => r.old.activated === r.new.activated));
const dist = (k) => JSON.stringify(ext.reduce((m, r) => (m[r[k].state] = (m[r[k].state] || 0) + 1, m), {}));
console.log("states OLD:", dist("old")); console.log("states NEW:", dist("new"));
console.log("--- active → inactive (id prefix, path, orders/shells/substantive, firstOrder, old state → new state, new reason)");
for (const r of a2i) console.log(" ", r.companyId.slice(0, 8) + "…", r.path, `${r.orders}/${r.shells}/${r.substantive}`, r.firstOrder, r.old.state, "→", r.new.state, "|", r.new.reason, r.knownOurs ? "| " + r.knownOurs : "");
console.log("--- inactive → active"); for (const r of i2a) console.log(" ", r.companyId.slice(0, 8) + "…", r.path, `${r.orders}/${r.shells}/${r.substantive}`, r.firstOrder, r.old.state, "→", r.new.state, "|", r.new.reason);
console.log("--- relabel only (activation unchanged)"); for (const r of stateFlips.filter((x) => x.old.activated === x.new.activated)) console.log(" ", r.companyId.slice(0, 8) + "…", r.old.state, "→", r.new.state, "| orders", r.orders, "shells", r.shells, "firstOrder", r.firstOrder, r.knownOurs ? "| " + r.knownOurs : "");
console.log("--- test/demo/our workspaces INSIDE the counted set (scope not changed, annotation only)");
for (const r of ext.filter((x) => x.knownOurs)) console.log(" ", r.companyId.slice(0, 8) + "…", r.knownOurs, "| old", r.old.state + "/" + r.old.activated, "new", r.new.state + "/" + r.new.activated, "| orders", r.orders, "shells", r.shells);
console.log("--- OUR (excluded):", rows.filter((r) => r.ours).map((r) => r.companyId.slice(0, 8) + "… old " + r.old.state + "/" + r.old.activated + " new " + r.new.state + "/" + r.new.activated).join(" "));
process.exit(0);
