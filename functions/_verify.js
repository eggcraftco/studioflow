const admin = require("firebase-admin");
admin.initializeApp({ projectId: "eggcraft-studio" });
const SINCE = Number(process.env.SINCE_MS || (Date.now() - 30 * 60 * 1000));
const EXPECT = { lifetime_lite: ["NivaDesk Starter", 1024], pro_monthly: ["NivaDesk Pro", 10240], team_monthly: ["NivaDesk Team", 51200] };
const DAY = 24 * 60 * 60 * 1000;
(async () => {
  const snap = await admin.firestore().collection("companies")
    .where("signupCompletedAt", ">=", admin.firestore.Timestamp.fromMillis(SINCE)).get();
  if (snap.empty) { console.log("bu pencerede yeni kayıt yok (baz çizgisi alındı)"); process.exit(0); }
  snap.forEach(d => {
    const x = d.data();
    const signup = x.signupCompletedAt?.toMillis?.() ?? 0;
    const started = x.billingTrialStartedAt?.toMillis?.() ?? 0;
    const ends = x.billingTrialEndsAt?.toMillis?.() ?? 0;
    const plan = String(x.billingPlan || "");
    const [wantName, wantMB] = EXPECT[plan] || ["?", "?"];
    const spanDays = ends && started ? (ends - started) / DAY : 0;
    console.log("\n" + (x.ownerEmail || d.id));
    console.log("  plan            :", plan, "| ad:", JSON.stringify(x.billingPlanName), "| durum:", x.billingStatus);
    console.log("  ekip cevabı     :", x.onboardingTeamSize, "koltuk  → öneri:", (Number(x.onboardingTeamSize) > 1 ? "team_monthly" : "pro_monthly"));
    console.log("  kayıt anı       :", new Date(signup).toISOString());
    console.log("  deneme başlangıç:", started ? new Date(started).toISOString() : "YOK");
    console.log("  deneme bitiş    :", ends ? new Date(ends).toISOString() : "YOK");
    console.log("  ---");
    console.log("  [1] kayıtta mı başlamış :", started && Math.abs(started - signup) < 5000 ? "✓ EVET" : `✗ HAYIR (fark ${Math.round((started-signup)/1000)}s)`);
    console.log("  [2] ad/limit plana uygun:", x.billingPlanName === wantName && x.billingStorageLimitMB === wantMB ? "✓ EVET" : `✗ HAYIR (bekleniyordu ${wantName}/${wantMB}, var ${x.billingPlanName}/${x.billingStorageLimitMB})`);
    console.log("  [3] süre tam 14 gün mü  :", Math.abs(spanDays - 14) < 0.01 ? "✓ EVET" : `✗ HAYIR (${spanDays.toFixed(3)} gün)`);
    console.log("  [4] seçim uygulanmış mı :", plan === (Number(x.onboardingTeamSize) > 1 ? "team_monthly" : "pro_monthly") ? "öneriyle aynı (override test edilmedi)" : "✓ ÖNERİDEN FARKLI — seçim uygulanmış");
  });
  process.exit(0);
})();
