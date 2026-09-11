// READ-ONLY: getActivationFunnel's totals recomputed with the deployed tree (main working tree = ff514cf8) — the same
// snapshot reads and the same engines — to set beside the admin page read at the same minute. Ids only, no names.
import { createRequire } from "node:module";
const require = createRequire("/Users/gocmen/Developer/studioflow-app/functions/package.json");
const admin = require("firebase-admin"); admin.initializeApp({ projectId: "eggcraft-studio" }); const db = admin.firestore();
const derive = require("/Users/gocmen/Developer/studioflow-app/functions/lifecycle/derive.js");
const activation = require("/Users/gocmen/Developer/studioflow-app/functions/lifecycle/activation.js");
const nowMs = Date.now(); const rows = (s) => ((s && s.docs) || []).map((d) => ({ id: d.id, ...d.data() })); const none = () => ({ docs: [] });
const companies = await db.collection("companies").limit(500).get(); const out = [];
for (const c of companies.docs) {
  const id = c.id;
  const [settingsSnap, orders, customers, banks, accounting, inventory, shopify, etsy, woo, square, ebay] = await Promise.all([
    db.collection("companySettings").doc(id).get(), db.collection("siparisler").where("companyId", "==", id).limit(400).get(), db.collection("musteriler").where("companyId", "==", id).limit(200).get(),
    db.collection("companies").doc(id).collection("bankConnections").limit(20).get().catch(none), db.collection("companies").doc(id).collection("accountingConnections").limit(20).get().catch(none), db.collection("companies").doc(id).collection("inventoryItems").limit(400).get().catch(none),
    db.collection("shopifyStores").where("companyId", "==", id).limit(20).get().catch(none), db.collection("etsyConnections").where("companyId", "==", id).limit(20).get().catch(none), db.collection("wooConnections").where("companyId", "==", id).limit(20).get().catch(none), db.collection("squareConnections").where("companyId", "==", id).limit(20).get().catch(none), db.collection("ebayConnections").where("companyId", "==", id).limit(20).get().catch(none)
  ]);
  const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
  const snap = { settings, orders: rows(orders), customers: rows(customers), bankConnections: rows(banks), accountingConnections: rows(accounting), inventoryItems: rows(inventory), shopifyStores: rows(shopify), etsyConnections: rows(etsy), wooConnections: rows(woo), squareConnections: rows(square), ebayConnections: rows(ebay) };
  const { events } = derive.deriveEvents(snap); const path = activation.activationPathFor(settings); const st = activation.lifecycleState({ events, path, nowMs });
  out.push({ id, state: st.state, activated: st.progress.activated, customers: snap.customers.length, orders: snap.orders.length, connected: events.some((e) => e.name === "integration_connected") });
}
const byState = {}; for (const r of out) byState[r.state] = (byState[r.state] || 0) + 1;
console.log("at", new Date(nowMs).toISOString(), "| workspaces:", out.length, "| activated:", out.filter((r) => r.activated).length, "| withCustomers:", out.filter((r) => r.customers > 0).length, "| withOrders:", out.filter((r) => r.orders > 0).length, "| integration_connected:", out.filter((r) => r.connected).length);
console.log("byState:", JSON.stringify(byState));
process.exit(0);
