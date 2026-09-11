// READ-ONLY: every workspace derived with the LIVE derive.js (deploy branch = getactivationfunnel-00003-cuv source)
// and with the CANDIDATE derive.js (funnel worktree), both with the five store collections. Ids only, no names.
import { createRequire } from "node:module";
const require = createRequire("/Users/gocmen/Developer/studioflow-app/functions/package.json");
const admin = require("firebase-admin"); admin.initializeApp({ projectId: "eggcraft-studio" }); const db = admin.firestore();
const liveDerive = require("/Users/gocmen/Developer/studioflow-app/functions/lifecycle/derive.js");
const newDerive = require("/Users/gocmen/Developer/studioflow-funnel/functions/lifecycle/derive.js");
const activation = require("/Users/gocmen/Developer/studioflow-app/functions/lifecycle/activation.js");
const nowMs = Date.now(); const rows = (s) => ((s && s.docs) || []).map((d) => ({ id: d.id, ...d.data() })); const none = () => ({ docs: [] });
const companies = await db.collection("companies").limit(500).get(); const out = []; const statusWords = {};
for (const c of companies.docs) {
  const id = c.id;
  const [settingsSnap, orders, customers, banks, accounting, inventory, shopify, etsy, woo, square, ebay] = await Promise.all([
    db.collection("companySettings").doc(id).get(), db.collection("siparisler").where("companyId", "==", id).limit(400).get(), db.collection("musteriler").where("companyId", "==", id).limit(200).get(),
    db.collection("companies").doc(id).collection("bankConnections").limit(20).get().catch(none), db.collection("companies").doc(id).collection("accountingConnections").limit(20).get().catch(none), db.collection("companies").doc(id).collection("inventoryItems").limit(400).get().catch(none),
    db.collection("shopifyStores").where("companyId", "==", id).limit(20).get().catch(none), db.collection("etsyConnections").where("companyId", "==", id).limit(20).get().catch(none), db.collection("wooConnections").where("companyId", "==", id).limit(20).get().catch(none), db.collection("squareConnections").where("companyId", "==", id).limit(20).get().catch(none), db.collection("ebayConnections").where("companyId", "==", id).limit(20).get().catch(none)
  ]);
  const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
  const snap = { settings, orders: rows(orders), customers: rows(customers), bankConnections: rows(banks), accountingConnections: rows(accounting), inventoryItems: rows(inventory), shopifyStores: rows(shopify), etsyConnections: rows(etsy), wooConnections: rows(woo), squareConnections: rows(square), ebayConnections: rows(ebay) };
  for (const [name, list] of [["shopify", snap.shopifyStores], ["etsy", snap.etsyConnections], ["woo", snap.wooConnections], ["square", snap.squareConnections], ["ebay", snap.ebayConnections]]) for (const r of list) { const k = name + ":" + String(r.status || "(none)"); statusWords[k] = (statusWords[k] || 0) + 1; }
  const path = activation.activationPathFor(settings);
  const run = (d) => { const { events } = d.deriveEvents(snap); const st = activation.lifecycleState({ events, path, nowMs }); return { state: st.state, activated: st.activated, connected: events.filter((e) => e.name === "integration_connected").length }; };
  out.push({ id, path, stores: snap.shopifyStores.length + snap.etsyConnections.length + snap.wooConnections.length + snap.squareConnections.length + snap.ebayConnections.length, live: run(liveDerive), cand: run(newDerive) });
}
const n = (f) => out.filter(f).length;
console.log("workspaces:", out.length, "| with store rows:", n((r) => r.stores > 0));
console.log("status words seen on store rows:", JSON.stringify(statusWords));
console.log("integration_connected workspaces live/candidate:", n((r) => r.live.connected > 0), "/", n((r) => r.cand.connected > 0), "| connected events total live/candidate:", out.reduce((a, r) => a + r.live.connected, 0), "/", out.reduce((a, r) => a + r.cand.connected, 0));
console.log("activated live/candidate:", n((r) => r.live.activated), "/", n((r) => r.cand.activated));
const diffs = out.filter((r) => r.live.state !== r.cand.state || r.live.activated !== r.cand.activated || r.live.connected !== r.cand.connected);
console.log("workspaces that differ:", diffs.length);
for (const r of diffs) console.log(" ", r.id.slice(0, 8) + "…", r.path, "stores", r.stores, "live", JSON.stringify(r.live), "→ cand", JSON.stringify(r.cand));
process.exit(0);
