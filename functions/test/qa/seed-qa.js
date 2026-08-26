// QA raporundaki senaryoyu emülatöre kurar: Team planlı bir atölye, bir onarım
// siparişi ve rapordaki para değerleri. Canlı veriye dokunmaz.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "eggcraft-studio" });
const db = admin.firestore();

const UID = "qa-review-uid";
const EMAIL = "review@nivadesk.app";
const COMPANY = "qa-workspace";
const ORDER = "QA-ORDER-1";

(async () => {
  try { await admin.auth().deleteUser(UID); } catch {}
  await admin.auth().createUser({ uid: UID, email: EMAIL, emailVerified: true, displayName: "QA Review" });

  // İkinci kullanıcı: dosya SİLME erişimi kapatılmış normal üye — kütüphane
  // çöp/silme kapısının klasik deleteClientFiles bayrağını saydığını test eder.
  const MEMBER_UID = "qa-member-uid";
  const MEMBER_EMAIL = "member@nivadesk.app";
  try { await admin.auth().deleteUser(MEMBER_UID); } catch {}
  await admin.auth().createUser({ uid: MEMBER_UID, email: MEMBER_EMAIL, emailVerified: true, displayName: "QA Member" });

  await db.collection("companies").doc(COMPANY).set({
    name: "My Studio",
    ownerUid: UID,
    billingPlan: "team_monthly",
    members: {
      [UID]: { role: "owner", email: EMAIL, name: "QA Review" },
      [MEMBER_UID]: { role: "member", email: MEMBER_EMAIL, name: "QA Member" }
    },
    memberRoles: { [UID]: "owner", [MEMBER_UID]: "member" },
    memberAccess: { [MEMBER_UID]: { deleteClientFiles: false } },
    createdAtMs: 1756000000000
  });
  await db.collection("users").doc(UID).set({ email: EMAIL, activeCompanyId: COMPANY });
  await db.collection("users").doc(MEMBER_UID).set({ email: MEMBER_EMAIL, activeCompanyId: COMPANY });
  await db.collection("companySettings").doc(COMPANY).set({
    selectedCurrency: "£", selectedLanguage: "English", appSubtitle: "My Studio",
    businessType: "Jewellery / Watch workshop", businessOnboardingCompleted: true,
    defaultVatRate: 20, taxCalculationBase: "revenue", platformFeePercent: 0
  });

  // Zincir halinde çalıştırılan takımlar birbirinin siparişlerini devralıyordu:
  // bir önceki koşudan kalan tek bir entegrasyon siparişi sayım iddialarını
  // bozmaya yetiyor. Her tohumlama çalışma alanını boşaltarak başlar.
  const stale = await db.collection("siparisler").where("companyId", "==", COMPANY).get();
  for (const doc of stale.docs) await doc.ref.delete();
  const staleSecrets = await db.collection("companies").doc(COMPANY).collection("integrationSecrets").get();
  for (const doc of staleSecrets.docs) await doc.ref.delete();
  // Quick Reply anahtarı ayrı koleksiyonda; kalırsa "anahtar yok" durumu hiç test edilemez.
  await db.collection("quickReplySecrets").doc(COMPANY).delete().catch(() => {});
  // Müşteriler ve destek biletleri de sayım iddialarına girer; temiz başla.
  const staleCustomers = await db.collection("musteriler").where("companyId", "==", COMPANY).get();
  for (const doc of staleCustomers.docs) await doc.ref.delete();
  const staleTickets = await db.collection("companies").doc(COMPANY).collection("workspaceTickets").get();
  for (const doc of staleTickets.docs) await doc.ref.delete();
  const staleSupport = await db.collection("supportTickets").where("companyId", "==", COMPANY).get();
  for (const doc of staleSupport.docs) await doc.ref.delete();
  const staleFileRecords = await db.collection("companies").doc(COMPANY).collection("fileRecords").get();
  for (const doc of staleFileRecords.docs) await doc.ref.delete();
  for (const kind of ["app", "workspace"]) {
    await db.collection("supportTicketDedupe").doc(`${kind}_${COMPANY}_${UID}`).delete().catch(() => {});
  }

  // Rapordaki sipariş: 25 Ağu oluşturma + 45 gün = 9 Ekim teslim
  await db.collection("siparisler").doc(ORDER).set({
    companyId: COMPANY,
    customerName: "QA Team Test Customer",
    designName: "Pop-up Sergi Standı — Team QA",
    orderValue: 1450,
    paidAmount: 400,
    watchPurchasePrice: 0,
    additionalExpenses: 120,
    paymentDate: admin.firestore.Timestamp.fromDate(new Date("2026-08-25T00:00:00.000Z")),
    deliveryTime: 45,
    orderType: "repair",
    status: "In Progress",
    designStatus: "In Progress",
    todoItems: [],
    createdAtMs: 1756000000000
  });

  const token = await admin.auth().createCustomToken(UID);
  const memberToken = await admin.auth().createCustomToken(MEMBER_UID);
  console.log(JSON.stringify({ uid: UID, companyId: COMPANY, orderId: ORDER, customToken: token, memberCustomToken: memberToken }));
  process.exit(0);
})().catch(e => { console.error("SEED HATASI:", e.message); process.exit(1); });
