# NivaDesk — Billing Go‑Live, Storage Add‑ons, Legal & Mobile IAP (2026‑06)

Bu dosya, bu oturumda (2026‑06‑08 → 06‑09) tamamlanan işleri özetler.
Platformlar: Mac/iOS (Swift), Android (Kotlin/Compose), Web (Next.js → Hostinger publish repo),
Firebase Functions (proje `eggcraft-studio`, region `europe-west2`).

---

## 1. Google Play Billing — teşhis ve düzeltmeler

- **lite‑monthly satın alımı planı güncellemiyor** sanılıyordu. Teşhis: satın alma **farklı bir workspace**'e (`KSQ…` = kişisel hesap) kaydedilmişti; kontrol edilen workspace (`iZFB…`) `manual_workspace` kaynaklı `team_monthly` idi. Pipeline aslında çalışıyordu; entitlement resolver, aktif Stripe Pro + Google Lite arasında en yükseği (Pro) gösteriyordu. **Bug değildi.**
- **Google Sign‑In "was cancelled":** Firebase'de hiçbir Android SHA parmak izi kayıtlı değildi. **Play App Signing + upload key** SHA‑1/SHA‑256 (4 parmak izi) Firebase Management API ile eklendi → giriş düzeldi.
- **Onboarding takılması (yeni workspace):** `firestore.rules` `companySettings/{id}` yazma kuralı, döküman create anında (`resource == null`) `diff(resource.data)` ile bozuluyordu → ilk yazma reddediliyordu. Create durumu eklendi, korunan alanlar (openAIKey vb.) hâlâ bloklu. **Deploy edildi.**
- **Monthly/Yearly ikisi de "current" görünüyordu:** Android `isCurrent` sadece plan tier'ını karşılaştırıyordu. Backend'in yazdığı `billingInterval` modele eklenip karşılaştırmaya katıldı.

## 2. In‑app Legal linkleri (App Store / Play uyumu)

- Mac/iOS + Android **Settings → "Legal"** bölümü: Privacy, Terms, Refund & Cancellation, Cookies, Acceptable Use, Account Deletion, Support & Contact → `nivadesk.app/...`. Her giriş yapan kullanıcıya açık.
- **Plan/paywall** ekranına otomatik‑yenileme açıklaması + **Terms + Privacy** linkleri (Apple Guideline 3.1.2 / Google Play).
- Web legal sayfaları zaten tamdı (10 sayfa, çok dilli, EGGCRAFT LIMITED bilgileriyle).
- Türkçe (+ ortak diller) çeviriler eklendi.

## 3. Storage Add‑ons (100GB / 200GB)

**Fiyatlar (VAT dahil — her platformda müşteri aynısını öder):**

| Add‑on | Aylık | Yıllık | Net aylık | Net yıllık |
|--------|------|--------|-----------|------------|
| +100 GB | £9 | £90 | £7.50 | £75 |
| +200 GB | £15 | £150 | £12.50 | £125 |

- **Backend enforcement bug'ı düzeltildi (kritik):** `billingStorageLimitMB` hiç base+addon olarak toplanmıyordu → add‑on alınca limit artmıyordu. `planLimitsFromEntitlements` artık aktif `billingStorageAddonMB`'yi base plana ekliyor (`activeStorageAddonMB` helper).
- **Stripe checkout:** storage ürünleri için `availableForCheckout: true`; aylık + yıllık item'lar (`storage_100gb`, `storage_100gb_yearly`, `storage_200gb`, `storage_200gb_yearly`).
- **Web `/plan`:** storage add‑on satın alma butonları (owner + Client Files planı), aktif add‑on "Current add‑on" işaretli.
- **Efektif depolama** (base+addon) Mac/Web/Android plan kartlarında doğru gösteriliyor (matris base kalıyor).

## 4. Mobil Storage IAP (Google Play + Apple StoreKit)

- **Backend:** `GOOGLE_PLAY_PRODUCTS` + `APPLE_PLAN_PRODUCTS`'a storage ürünleri; `persistGoogleStorageAddon` / `persistAppleStorageAddon` + `persistGoogle/ApplePurchase` router'lar (verify + RTDN / App Store notification storage'ı `billingStorageAddon*` alanlarına yazıyor — plan tier'ını değiştirmeden). **Deploy edildi.**
- **Android:** `StudioGooglePlayBillingManager` `STORAGE_OFFERS` + `storageOffers`; ViewModel `purchaseGoogleStorageAddon`; Plan ekranına storage kartı.
- **Mac/iOS:** `StudioStoreKitManager.storageAddonOptions` + `purchaseStorageAddon`; `verifyAppleStorageAddonPurchase`; Plan ekranına storage kartı (plan kartlarıyla uyumlu tasarım, seçili kart accent‑tonlu dolgu).

### Store ürün ID'leri (kodda sabit — birebir eşleşmeli)

**Google Play** (subscription productId | basePlanId → key):
- `nivadesk_storage_100gb | storage-100gb-monthly` → `storage_100gb`
- `nivadesk_storage_100gb | storage-100gb-yearly` → `storage_100gb_yearly`
- `nivadesk_storage_200gb | storage-200gb-monthly` → `storage_200gb`
- `nivadesk_storage_200gb | storage-200gb-yearly` → `storage_200gb_yearly`

**Apple** (product ID → key, "NivaDesk Extra Storage" group'unda, plan group'undan AYRI):
- `uk.co.eggcraft.studioflow.storage.100gb.monthly` → `storage_100gb`
- `uk.co.eggcraft.studioflow.storage.100gb.yearly` → `storage_100gb_yearly`
- `uk.co.eggcraft.studioflow.storage.200gb.monthly` → `storage_200gb`
- `uk.co.eggcraft.studioflow.storage.200gb.yearly` → `storage_200gb_yearly`

## 5. Stripe Production Go‑Live ✅ (TAMAMLANDI — canlı satış açık)

- **Canlı ürün/fiyatlar** Stripe Live mode'da oluşturuldu (Lite/Pro/Team + Storage 100/200GB, aylık+yıllık). 10 canlı Price ID `functions/.env`'e yazıldı.
- **Firebase secrets:** `STRIPE_SECRET_KEY=sk_live_…`, `STRIPE_WEBHOOK_SECRET=whsec_…` (kullanıcı kendi terminalinde set etti).
- **`.env`:** `STRIPE_ALLOW_LIVE_BILLING=true`.
- **Canlı webhook:** `https://stripewebhook-ukbn4tcyca-nw.a.run.app`, events: `checkout.session.completed`, `customer.subscription.created/updated/deleted`.
- **Frontend:** `/plan` satın alma butonları artık **tüm owner'lara** görünür (varsayılan live; `NEXT_PUBLIC_NIVADESK_BILLING_LIVE !== "false"`). Hostinger env bağımlılığı olmadan çalışır. Backend kimin checkout tamamlayabileceğini denetler.
- **Doğrulandı:** Web'den gerçek £9 Lite satın alındı → plan değişti → Mac'te yansıdı → Stripe'ta ödeme + webhook 200.

> ⚠️ Test alımı gerçek bir abonelik oluşturdu; Stripe Customers'tan iptal/iade edilmeli.

---

## Önemli mimari notlar

- **Merkezi entitlement:** `companies/{workspaceId}` üzerindeki `billingPlan`, `billingInterval`, `billingStorageAddonMB/Key/Status` alanları tüm platformlarca okunur. Add‑on tek slot; son yazan provider kazanır.
- **Efektif depolama** = base plan + `billingStorageAddonMB`, **okuma anında** birleştirilir (persist edilen `billingStorageLimitMB` = base; çift sayma riskinden kaçınmak için).
- **Deploy kuralı:** asla full `firebase deploy --only functions` yapma (orphan riski); sadece spesifik fonksiyonları deploy et.
- **Web deploy:** `studioflow-web` kaynakta; canlı `nivadesk.app` için `~/Developer/studioflow-hostinger-publish-20260530` publish repo'ya dosya kopyala → build → commit → push (`eggcraftco/studioflow` main → Hostinger rebuild). `.next` ve `.env.local` gitignore'da; NEXT_PUBLIC env'leri Hostinger sunucusundaki `.env.local`'dan gelir.
- **Android versionCode:** şu an 4 / 0.1.3.

## Bekleyen testler / işler

- **Apple sandbox** storage IAP testi (sandbox tester hesabı, Xcode'dan çalıştır).
- **Android** versionCode 4 AAB'yi Play internal test'e yükle (+ Google 200GB ürününü etkinleştir), telefonda storage satın alma testi.
- Stripe **test aboneliğini iptal/iade** et.
- (İleride) Apple App Review submission hazırlığı.
