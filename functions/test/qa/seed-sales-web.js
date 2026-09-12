// Seeds the Sales web candidate into the EMULATOR only. Deliberately uses ids
// and addresses of its own: nothing here resembles EGGcraft's real workspace,
// the retention pilot or the OpenAI review identities, so a mistaken pointing at
// production could not overwrite any of them.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "eggcraft-studio" });
const db = admin.firestore();
const { Timestamp } = admin.firestore;

const COMPANY = "salesweb-workspace";
const OWNER = "salesweb-owner";
const NOMONEY = "salesweb-nomoney";
const ASSIGNED = "salesweb-assigned";

const day = (iso) => Timestamp.fromMillis(Date.parse(iso));
const order = (id, extra = {}) => ({
  companyId: COMPANY, customerName: "Alex Morgan", paymentDate: day("2026-09-10T00:00:00Z"),
  lineItems: [{ id: `${id}-l1`, name: "Seamaster 300 service", quantity: 1, unitPrice: 420, lineTotal: 420 }],
  paidAmount: 420, remainingAmount: 0, isDelivered: false,
  finance: { engineVersion: 4, revenue: 420 }, ...extra
});

(async () => {
  for (const [uid, email, name] of [[OWNER, "owner@salesweb.invalid", "Sam Owner"], [NOMONEY, "nomoney@salesweb.invalid", "Kim NoMoney"], [ASSIGNED, "assigned@salesweb.invalid", "Rio Assigned"]]) {
    try { await admin.auth().deleteUser(uid); } catch {}
    await admin.auth().createUser({ uid, email, emailVerified: true, displayName: name });
  }

  await db.collection("companies").doc(COMPANY).set({
    companyId: COMPANY, name: "Sales Web QA", ownerUid: OWNER,
    billingPlan: "team_monthly", billingStatus: "active",
    memberUids: [OWNER, NOMONEY, ASSIGNED],
    memberRoles: { [OWNER]: "owner", [NOMONEY]: "member", [ASSIGNED]: "member" },
    members: { [OWNER]: { role: "owner" }, [NOMONEY]: { role: "member" }, [ASSIGNED]: { role: "member" } },
    memberAccess: {
      [NOMONEY]: { orders: true, financialInfo: false },
      [ASSIGNED]: { orders: true, financialInfo: true, assignedProjectsOnly: true }
    }
  });
  await db.collection("companySettings").doc(COMPANY).set({ seciliParaBirimi: "£", onboardingMainGoal: "connect_store" });
  await db.collection("users").doc(OWNER).set({ companyId: COMPANY, activeCompanyId: COMPANY, selectedLanguage: "English" }, { merge: true });
  await db.collection("users").doc(NOMONEY).set({ companyId: COMPANY, activeCompanyId: COMPANY, selectedLanguage: "English" }, { merge: true });
  await db.collection("users").doc(ASSIGNED).set({ companyId: COMPANY, activeCompanyId: COMPANY, selectedLanguage: "English" }, { merge: true });

  const rows = [
    ["SW-1", { commerce: { provider: "shopify", externalId: "1001" } }],
    ["SW-2", { commerce: { provider: "etsy", externalId: "2002" }, customerName: "Jordan Lee", paymentDate: day("2026-09-09T00:00:00Z") }],
    ["SW-3", { commerce: { provider: "ebay", externalId: "3003" }, customerName: "Withheld Buyer", paymentDate: day("2026-09-08T00:00:00Z") }],
    ["SW-4", { orderType: "repair", customerOwnedItem: true, customerName: "Robin Patel", paymentDate: day("2026-09-07T00:00:00Z"), remainingAmount: 120, paidAmount: 300 }],
    ["SW-5", { customerName: "Casey Brook", paymentDate: day("2026-09-06T00:00:00Z"), finance: { engineVersion: 1, revenue: 90 } }],
    ["SW-6", { customerName: "Noor Ahmed", paymentDate: day("2026-09-05T00:00:00Z"), isDelivered: true, assignedToUid: "salesweb-assigned" }],
    ["SW-7", { customerName: "Dana Ross", paymentDate: day("2026-09-04T00:00:00Z"), assignedToUid: "salesweb-assigned" }],
    ["SW-8", { customerName: "Eli Frost", paymentDate: day("2026-09-03T00:00:00Z") }]
  ];
  for (const [id, extra] of rows) await db.collection("siparisler").doc(id).set(order(id, extra));

  await db.collection("etsyConnections").doc("sw-etsy").set({ companyId: COMPANY, status: "connected", externalShopId: "999" });
  await db.collection("shopifyStores").doc("sw-shop").set({ companyId: COMPANY, status: "active" });
  await db.collection("appConfig").doc("sales").set({ enabled: true, workspaces: { [COMPANY]: true } });
  await db.collection("companies").doc(COMPANY).collection("salesSettings").doc("main").set({ visibility: "on" });

  const token = await admin.auth().createCustomToken(process.env.SEED_AS || OWNER);
  console.log("SEEDED");
  console.log("CUSTOM_TOKEN=" + token);
  process.exit(0);
})().catch((error) => { console.error("seed failed:", error.message); process.exit(1); });
