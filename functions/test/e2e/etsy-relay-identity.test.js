// A relay address is not an identity.
//
// Etsy hides most buyers behind something@convos.etsy.com. The same buyer can
// arrive under a different relay on their next receipt, and a relay can be
// reissued to somebody else entirely — which is why etsyCustomerMatch scores
// relay addresses at zero and refuses to match on one.
//
// The customer mirror did not know that. Its identity ladder is
// external-id → email → name, and the email rung was matching on whatever Etsy
// sent. So on the one path where the matcher had already decided "this is a
// new person", the mirror could still walk up to an existing customer holding
// that relay address and file the order under them. Two strangers, one record,
// and the seller is told NivaDesk never merges on email alone.
//
// This runs against a real Firestore because the bug lives in the queries.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.NIVADESK_E2E = "1";
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });

const admin = require("firebase-admin");
const fns = require("../../index.js");
const { upsertIntegrationCustomer } = fns._e2e;
const db = admin.firestore();

const COMPANY = "relay-identity-co";
let fail = 0;
const ok = (label, cond, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "ok " : "FAIL"}  ${label}${cond ? "" : "  <- " + detail}`);
};

async function customersNamed(name) {
  const snap = await db.collection("musteriler")
    .where("companyId", "==", COMPANY).where("name", "==", name).get();
  return snap.docs;
}

async function wipe() {
  const snap = await db.collection("musteriler").where("companyId", "==", COMPANY).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

(async () => {
  await wipe();

  const RELAY = "a1b2c3@convos.etsy.com";

  // One buyer arrives and is mirrored.
  await upsertIntegrationCustomer(COMPANY, { name: "Ada Lovelace", email: RELAY }, "etsy");
  ok("the first Etsy buyer is created", (await customersNamed("Ada Lovelace")).length === 1);

  // A DIFFERENT buyer turns up under the same reissued relay address. Etsy's
  // own matcher would score this at zero and create a new person.
  await upsertIntegrationCustomer(COMPANY, { name: "Grace Hopper", email: RELAY }, "etsy");
  const grace = await customersNamed("Grace Hopper");
  ok("a different buyer on the same relay is not merged into the first", grace.length === 1,
     `found ${grace.length} customers named Grace Hopper`);
  const ada = await customersNamed("Ada Lovelace");
  ok("and the first buyer keeps their own name", ada.length === 1 && ada[0].data().name === "Ada Lovelace",
     JSON.stringify(ada.map((d) => d.data().name)));

  // The rung still works for a real address, which is what Shopify and
  // WooCommerce send — removing it for everyone would have been the wrong fix.
  await wipe();
  await upsertIntegrationCustomer(COMPANY, { name: "Ada Lovelace", email: "ada@analytical.co.uk" }, "shopify");
  await upsertIntegrationCustomer(COMPANY, { name: "Ada L", email: "ada@analytical.co.uk" }, "shopify");
  const byRealEmail = await db.collection("musteriler").where("companyId", "==", COMPANY).get();
  ok("a real email still identifies the same person across a name change", byRealEmail.size === 1,
     `${byRealEmail.size} customers`);

  // And an Etsy buyer with a real address is matched like anybody else.
  await wipe();
  await upsertIntegrationCustomer(COMPANY, { name: "Ada Lovelace", email: "ada@analytical.co.uk" }, "etsy");
  await upsertIntegrationCustomer(COMPANY, { name: "Ada Lovelace", email: "ada@analytical.co.uk" }, "etsy");
  const etsyReal = await db.collection("musteriler").where("companyId", "==", COMPANY).get();
  ok("an Etsy buyer who gave a real address is still matched on it", etsyReal.size === 1,
     `${etsyReal.size} customers`);

  await wipe();
  console.log(fail ? `\n${fail} failed` : "\n5/5 passed");
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
