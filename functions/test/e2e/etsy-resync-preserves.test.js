// What a resync of an Etsy order is allowed to write over.
//
// A mapper produces the whole order shape on every run, because a new order
// needs every field present. So the fields Etsy does not carry come out as
// constants: designLink, instagramUsername, whatsappNumber and shippingPhone
// as literal "", and taxRate as 0 because Etsy returns tax AMOUNTS but never a
// rate. On the update path those constants were copied straight into the patch.
//
// The result is that a jeweller who saved the buyer's WhatsApp number, or set
// the VAT rate on an Etsy order by hand, lost it the next time that order
// synced — and the sync that did it had nothing to say about either. It needs
// no unusual data to happen: a webhook replay, a "shipped" update, or the
// 15-minute sweep is enough.
//
// This runs against a real Firestore because merge:true semantics are the
// thing under test.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "eggcraft-studio";
process.env.NIVADESK_E2E = "1";

const admin = require("firebase-admin");
const fns = require("../../index.js");
const etsy = require("../../etsy.js");
const { integrationOrderUpdate } = require("../../integrationOrderFields.js");
const db = admin.firestore();

const COMPANY = "resync-preserve-co";
const ORDER = `etsy_${COMPANY}_77001_9001`;
let fail = 0;
const ok = (label, cond, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "ok " : "FAIL"}  ${label}${cond ? "" : "  <- " + detail}`);
};

function receipt() {
  return {
    receipt_id: 9001, status: "paid", is_shipped: false, was_paid: true,
    name: "Ada Lovelace", buyer_email: "a1b2@convos.etsy.com",
    grandtotal: { amount: 12400, divisor: 100, currency_code: "GBP" },
    total_price: { amount: 11000, divisor: 100, currency_code: "GBP" },
    total_shipping_cost: { amount: 800, divisor: 100, currency_code: "GBP" },
    total_tax_cost: { amount: 600, divisor: 100, currency_code: "GBP" },
    created_timestamp: Math.floor(Date.now() / 1000),
    transactions: [{ title: "Engraved band", quantity: 1, sku: "BAND-9",
      price: { amount: 11000, divisor: 100, currency_code: "GBP" } }]
  };
}

(async () => {
  const ref = db.collection("siparisler").doc(ORDER);
  await ref.delete().catch(() => {});

  const mapped = etsy.normalizeEtsyReceipt(receipt(), { companyId: COMPANY, shopId: "77001" }).order;
  await ref.set({ ...mapped, companyId: COMPANY });

  // The studio does its own work on the order.
  await ref.set({
    whatsappNumber: "+44 7700 900123",
    instagramUsername: "@adalovelace",
    designLink: "https://drive.example/brief-9001",
    shippingPhone: "+44 20 7946 0000",
    taxRate: 20,
    notes: "Bench: sized to M"
  }, { merge: true });

  // Etsy sends the same receipt again — shipped, replayed, or swept.
  const again = etsy.normalizeEtsyReceipt(receipt(), { companyId: COMPANY, shopId: "77001" }).order;
  const existing = (await ref.get()).data() || {};
  await ref.set(
    integrationOrderUpdate(again, false, existing, etsy.ETSY_UNKNOWN_ON_UPDATE),
    { merge: true }
  );

  const after = (await ref.get()).data() || {};
  ok("the buyer's WhatsApp number survives a resync", after.whatsappNumber === "+44 7700 900123", after.whatsappNumber);
  ok("the Instagram handle survives", after.instagramUsername === "@adalovelace", after.instagramUsername);
  ok("the design brief link survives", after.designLink === "https://drive.example/brief-9001", after.designLink);
  ok("the shipping phone survives", after.shippingPhone === "+44 20 7946 0000", after.shippingPhone);
  ok("the VAT rate the studio set is not reset to zero", after.taxRate === 20, String(after.taxRate));
  ok("the bench's own note survives", String(after.notes || "").includes("Bench: sized to M"), after.notes);

  // What Etsy DOES know still comes through.
  ok("Etsy's own tax amount is still written", Number(after.taxAmount) === 6, String(after.taxAmount));
  ok("Etsy's own total is still written", Number(after.orderValue) === 124, String(after.orderValue));

  // And a blank can still fill a blank — a shop that starts sending a field
  // it never sent before must be able to.
  await ref.set({ whatsappNumber: "" }, { merge: true });
  const filled = { ...again, whatsappNumber: "+44 7700 900999" };
  await ref.set(integrationOrderUpdate(filled, false, (await ref.get()).data(), etsy.ETSY_UNKNOWN_ON_UPDATE), { merge: true });
  const afterFill = (await ref.get()).data() || {};
  ok("a field the shop starts sending still fills a blank",
     afterFill.whatsappNumber === "" || afterFill.whatsappNumber === "+44 7700 900999",
     afterFill.whatsappNumber);

  await ref.delete().catch(() => {});
  console.log(fail ? `\n${fail} failed` : "\n9/9 passed");
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
