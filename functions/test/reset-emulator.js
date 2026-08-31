// Wipe the emulator's data between integration suites.
//
// The 19 suites in this tier were each written to be run by hand, alone, against
// a freshly seeded emulator. Run back to back they poison each other: one
// suite's orders are counted by the next one's assertions, and
// previewFinancialRecalculationForOrders reported 8 skipped integration orders
// where the suite that asked expected its own 2. That is not a product bug, but
// it is why nobody could run them as a batch — and a suite nobody can run is a
// suite that is not protecting anything.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "eggcraft-studio" });
const db = admin.firestore();

(async () => {
  const collections = await db.listCollections();
  await Promise.all(collections.map((c) => db.recursiveDelete(c)));
  process.exit(0);
})().catch((error) => { console.error("reset failed:", error.message); process.exit(1); });
