// Emülatöre gerçekçi bir atölye kurar: kullanıcı, çalışma alanı, müşteri,
// iki sipariş ve bir banka akışı. Canlı veriye dokunmaz.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "eggcraft-studio" });
const db = admin.firestore();

const UID = "deneme-test-uid";
const EMAIL = "deneme@test.com";

(async () => {
  try { await admin.auth().deleteUser(UID); } catch {}
  await admin.auth().createUser({ uid: UID, email: EMAIL, emailVerified: true, displayName: "Deneme Atölye" });

  // Çalışma alanı: kullanıcı sahibi. companyId = uid deseni de destekleniyor
  // ama ayrı bir id kullanmak gerçek kurulumlara daha yakın.
  const COMPANY = "deneme-workspace";
  await db.collection("companies").doc(COMPANY).set({
    name: "Deneme Atölye",
    ownerUid: UID,
    billingPlan: "team_monthly",
    // Kurallar members[uid].role okur; boolean değil nesne olmalı
    members: { [UID]: { role: "owner", email: EMAIL, name: "Deneme" } },
    memberRoles: { [UID]: "owner" },
    createdAtMs: 1756000000000
  });
  await db.collection("users").doc(UID).set({ email: EMAIL, activeCompanyId: COMPANY });
  // Ayarlar ÜST DÜZEY koleksiyonda: companySettings/{companyId}
  await db.collection("companySettings").doc(COMPANY).set({
    selectedCurrency: "£", selectedLanguage: "English", appSubtitle: "Deneme Atölye",
    businessType: "Jewellery / Watch workshop", businessOnboardingCompleted: true
  });

  // İki sipariş: biri rezervasyon için, biri çift-satış denemesi için
  for (const [id, name] of [["ORD-1001", "Ayşe Yılmaz"], ["ORD-1002", "Mehmet Demir"]]) {
    // Siparişler ÜST DÜZEY koleksiyonda: siparisler/{orderId}
    await db.collection("siparisler").doc(id).set({
      companyId: COMPANY, customerName: name, designName: "Vintage restorasyon",
      paidAmount: 0, remainingAmount: 1200, watchPurchasePrice: 0,
      status: "In Progress", createdAtMs: 1756000000000
    });
  }

  // Banka akışı: biri alımla tam eşleşecek, ikisi çeldirici
  const bank = [
    { id: "tx-exact",  amount: -2550, bookingDate: "2026-08-20", counterparty: "Vintage Watch Co", description: "CARD PAYMENT" },
    { id: "tx-close",  amount: -2450, bookingDate: "2026-08-19", counterparty: "Vintage Watch Co", description: "CARD PAYMENT" },
    { id: "tx-far",    amount: -85.4, bookingDate: "2026-08-18", counterparty: "Royal Mail",       description: "POSTAGE" },
    { id: "tx-income", amount: 1200,  bookingDate: "2026-08-21", counterparty: "Ayşe Yılmaz",      description: "BANK TRANSFER" }
  ];
  for (const t of bank) {
    await db.collection("companies").doc(COMPANY).collection("bankTransactions").doc(t.id)
      .set({ ...t, currency: "GBP", status: "booked", category: "", categoryAuto: "" });
  }

  const token = await admin.auth().createCustomToken(UID);
  console.log(JSON.stringify({ uid: UID, companyId: COMPANY, customToken: token }));
  process.exit(0);
})().catch(e => { console.error("SEED HATASI:", e.message); process.exit(1); });
