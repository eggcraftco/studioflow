# Dış göz denetimi — sabah deploy listesi (3 Eyl 2026)

`firestore.rules` ve `storage.rules` GECE DEPLOY EDİLDİ ve canlı. Cloud Functions düzeltmeleri
kodda ve test edildi (QA 37/37, kural testleri 78 PASS) ama **deploy edilmedi**.

Bu dalda kör `firebase deploy --only functions` GÜVENSİZ: canlıda bu daldan daha yeni fonksiyonlar
var ve prune `wooCommerceSiparis`'i siler (hafıza notu: functions-deploy-branch-divergence).
İsimle deploy prune yapmaz. Deploy edilmeyen fonksiyon eski kodla çalışmaya devam eder.

## 1) Gitmesi gerekenler (48 fonksiyon)

Gövdesi ya da kullandığı yardımcı gerçekten değişenler.

```bash
npx firebase deploy --project eggcraft-studio --only \
  functions:addWorkspaceTeamMember,functions:anonymizeWebCustomer,functions:approveWorkspaceJoinRequest,functions:changeAccountEmail,functions:cleanupStaleUnverifiedAccounts,functions:createStripeCheckoutSession,functions:createSwiftOrder,functions:createWebOrder,functions:deleteMyAccount,functions:deleteWebCustomer,functions:deleteWorkspaceData,functions:exportOrders,functions:getAdminFeatureUsageDetail,functions:getAdminInsights,functions:getAdminLookup,functions:getAdminOnboardingDetail,functions:getAdminPlansDetail,functions:getAdminRevenueDetail,functions:getAdminStorageDetail,functions:getAdminSubscriptionsDetail,functions:getAdminUsersWorkspacesDetail,functions:getCustomOrderLandingStats,functions:getEstimateForVisitor,functions:getPortalForVisitor
```

```bash
npx firebase deploy --project eggcraft-studio --only \
  functions:getSearchConsoleStats,functions:getSiteStats,functions:importOpeningStock,functions:importWorkspaceBackup,functions:initializeFreeDemoWorkspace,functions:mergeOrders,functions:mergeWebCustomers,functions:notifyCustomerOnStatusChange,functions:postEstimateDecision,functions:purgeExpiredEstimateLinks,functions:recalculateWorkspacePlanUsage,functions:removeWorkspaceTeamMember,functions:resetCustomOrderLandingStats,functions:resyncStripeWorkspaceEntitlements,functions:revokeOrderEstimateLink,functions:saveInventoryItem,functions:saveSwiftOrder,functions:saveThemeBrandingSettings,functions:scheduledBillingEntitlementReconcile,functions:scheduledReminderCheck,functions:sendOrderEstimate,functions:stripeWebhook,functions:syncWorkflowSafeOrderView,functions:updateWebOrder
```

## 2) Yapıldı — 3 Eyl 2026

Yukarıdaki 48 fonksiyon canlıya alındı (üç parti, hepsi "Successful update operation").
Kurallar da düzeltilmiş haliyle canlıda.

Not: bu bölümde daha önce `holdIntegrationOrder`, `wooCommerceSiparis`, `shopifyOrderWebhook`,
`etsyWebhook`, `squareWebhook`, `markActivityNotificationRead`, `scheduledTrackingRefresh` diye
bir "sonra" listesi vardı. Bunlar hafızadan yazılmıştı ve **hiçbiri gerçek bir fonksiyon adı
değil** — `firebase functions:list` 221 fonksiyon döndürüyor, bu adlar aralarında yok. Tek
kayıpları `sendPushNotificationToCompany`'nin ölü token temizliğiydi; o da bu fonksiyonlar
ilerideki turlarda yeniden deploy edildikçe kendiliğinden gidecek.

## Deploy sonrası hızlı kontrol

- `scheduledReminderCheck` logu: artık gerçek çalışma alanları için çalışıyor (eskiden yalnız `test_studio_123`).
- Bir siparişin durumunu A → B → A yapın: müşteriye A mesajı İKİNCİ KEZ gitmemeli.
- Free bir hesapta Mac'ten ödeme girin: defterde kalmalı (eskiden sessizce düşüyordu).
- Yeni bir Mac/iPhone/Android kaydı: 14 günlük deneme başlamalı.
- Stripe ödeme sayfasını açıp vazgeçin: deneme hakkı YANMAMALI.
- Bir üyeyle web'de Orders açılmalı (kural düzeltmesi zaten canlı).
- Bir müşteriyi silin: onay ekranı çıkmalı (Mac) ve sipariş adları "New Project"e dönmemeli KARARI BEKLİYOR (aşağı bakın).

Web ayrıca "canlıya at" denince Round N ile yayınlanmalı; native değişiklikler mağaza sürümü bekliyor.

## Karar bekleyen 5 madde

Bunlar ürün kararı olduğu için elimden geldiğince dokunmadım; DURUM.md ve sabah özetinde ayrıntısı var.

1. Müşteri silinince siparişlerdeki ad "New Project" oluyor (Sunucu #6) — ad kalsın mı, sadece iletişim mi silinsin?
2. Aynı sipariş için kâr ve KDV dört platformda farklı hesaplanıyor (Parite #4-#7) — tek doğru kural hangisi?
3. "+ Add Project" hiç sormadan boş sipariş açıyor (Elle #12) — mini form mu, geri-al bildirimi mi?
4. Team planından düşünce mevcut üyeler tam erişimle kalıyor (Sunucu #20) — salt okunur mu olsunlar?
5. Davet akışı ters: sahip kimseyi davet edemiyor (Elle #24) — e-posta ile davet linki yazılsın mı?
