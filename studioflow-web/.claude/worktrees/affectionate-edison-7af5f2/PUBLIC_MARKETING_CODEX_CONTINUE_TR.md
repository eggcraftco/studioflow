# StudioFlow Public Website / Marketing / Pricing / Billing - Codex Devam Notu

Bu dosya, yeni bir Codex başlığı açıldığında **bu başlıkta yaptığımız Public Website / Marketing / Pricing / Billing çalışmalarını** Codex’in hızlıca anlaması için hazırlanmıştır.

> Önemli: Bu doküman sadece **public website / marketing / pricing / signup / billing planning** başlığı içindir.  
> Mac/iOS Swift uygulaması, logged-in web portal, order kartları, Client Files, Team Access, Apple-to-Web parity matrix gibi iç uygulama geliştirme işleri **ayrı Codex başlığında** devam etmelidir.

---

## 1. Bu Codex başlığının kapsamı

Bu başlık sadece şu işler için kullanılmalı:

- StudioFlow public marketing website
- Giriş / tanıtım sayfaları
- Pricing sayfası
- Signup / login giriş akışı
- Public FAQ / Contact / Privacy / Terms
- Public site localization / çok dilli altyapı
- SEO ve public site metinleri
- Billing planı
- Stripe test-mode altyapısı
- Safe billing planning

Bu başlıkta yapılmaması gerekenler:

- Swift / Mac app dosyalarını değiştirmek
- Logged-in portal özelliklerini geliştirmek
- Order / card / Client Files / Team gibi iç uygulama özelliklerini değiştirmek
- Canlı ödeme açmak
- Windows / Android kodlamaya başlamak
- Firebase Functions içindeki ana uygulama logic’ini gereksiz değiştirmek

---

## 2. Proje genel yapısı

Ana proje klasörü:

```text
/Users/gunesgocmen/Desktop/finance/EGGcraft
```

Ana bölümler:

```text
EGGcraft/
SwiftUI Mac / iPad / iPhone uygulaması

functions/
Firebase Cloud Functions backend

studioflow-web/
Next.js + Firebase web portal ve public website
```

Public website bu klasörde çalışır:

```text
/Users/gunesgocmen/Desktop/finance/EGGcraft/studioflow-web
```

---

## 3. Local development port ayrımı

`http://localhost:3000/` adresi **diğer aktif StudioFlow web/app test session** için ayrılmıştır.

Bu Public Marketing / Billing başlığı için local test portu:

```text
http://localhost:3002
```

Eğer 3002 doluysa:

```text
http://localhost:3003
```

Kullanılacak komut:

```bash
cd /Users/gunesgocmen/Desktop/finance/EGGcraft/studioflow-web
npm run dev -- -p 3002
```

Yedek:

```bash
npm run dev -- -p 3003
```

Codex her local server çalıştırdığında hangi URL’in aktif olduğunu raporlamalıdır.

---

## 4. Bu başlıkta yaptıklarımız

### 4.1 Public website başlığı ayrıldı

Bu Codex başlığının sadece şu konular için kullanılmasına karar verildi:

```text
- Public marketing website
- Pricing page
- Signup / login public entry
- FAQ / Contact / Privacy / Terms
- Billing architecture
- Stripe test-mode scaffold
- Public site localization
- SEO / public page copy
```

Ana Mac/iOS app ve logged-in web portal başka bir Codex başlığında aktif geliştirilmeye devam ediyor.

---

### 4.2 Public site için ilk yapı kuruldu

Codex public site için ilk marketing pass yaptı.

Eklenen public routes:

```text
/
/features
/pricing
/signup
/faq
/privacy
/terms
/contact
/login
```

Routing mantığı:

```text
Login olmayan kullanıcı:
- Public site sayfalarını görebilir.

Login olan kullanıcı:
- Portal tarafına geçebilir.

Login olmuş kullanıcı /login sayfasına giderse:
- /dashboard tarafına yönlendirilir.
```

Önemli dosyalar:

```text
PUBLIC_SITE_AND_BILLING_PLAN.md
studioflow-web/components/PublicMarketing.tsx
studioflow-web/app/layout.tsx
studioflow-web/app/login/page.tsx
studioflow-web/app/globals.css
```

---

### 4.3 Public site görsel olarak geliştirildi

İlk public site tasarımından sonra daha premium / soft / renkli bir visual design pass yaptırıldı.

Eklenen görsel yön:

```text
- Soft pastel renk paleti
- Sage, clay, sky, lilac, rose, gold tonları
- Daha premium hero alanı
- App-like workspace mockup
- Customizable card/workspace hissini veren görsel detaylar
- Daha iyi pricing kartları
- Daha güzel feature kartları
- Signup, FAQ, Contact, Privacy, Terms sayfalarında görsel uyum
```

Hedef duygu:

```text
StudioFlow sıradan SaaS gibi görünmesin.
Yaratıcı stüdyolar için premium, soft, hoş ve keyifli bir ürün hissi versin.
```

---

### 4.4 Public site billing planı hazırlandı

`PUBLIC_SITE_AND_BILLING_PLAN.md` dosyası oluşturuldu.

Bu dosyanın amacı:

```text
- Web billing nasıl olacak?
- Stripe nerede kullanılacak?
- Apple app StoreKit ile nasıl ilişkilenecek?
- Gelecekte Windows / Android billing nasıl bağlanacak?
- Merkezi Firebase billing state nasıl olmalı?
- Canlı ödeme ne zaman açılmalı?
```

Önemli karar:

```text
Şimdilik canlı ödeme yok.
Sadece güvenli test-mode altyapısı ve planlama var.
```

---

### 4.5 Stripe test-mode scaffold hazırlandı

Codex Stripe altyapısı için test-mode scaffold hazırladı.

Eklenen / güncellenen dosyalar:

```text
functions/stripeBilling.js
functions/index.js
functions/package.json
functions/package-lock.json
functions/.env.example

studioflow-web/lib/studioflow/billingActions.ts
studioflow-web/lib/studioflow/firestore.ts
studioflow-web/app/plan/page.tsx
studioflow-web/components/PublicMarketing.tsx
studioflow-web/lib/publicSite/translations.ts
studioflow-web/app/globals.css
studioflow-web/.env.local.example
studioflow-web/README.md

PUBLIC_SITE_AND_BILLING_PLAN.md
```

Hazırlanan server yapıları:

```text
createStripeCheckoutSession
createStripeCustomerPortalSession
stripeWebhook
```

Stripe plan mapping:

```text
lifetime_lite
pro_monthly
team_monthly
storage_100gb
storage_200gb
```

Ödeme canlı değildir. Varsayılan güvenli durum:

```text
STRIPE_BILLING_ENABLED=false
STRIPE_ALLOW_LIVE_BILLING=false
```

Bu çok önemli:  
**Şu an kullanıcıdan para çekilmez.**

Stripe için ileride gerekli olacaklar:

```text
- Stripe test products
- Stripe test price IDs
- Stripe webhook endpoint
- Stripe Customer Portal test setup
- Test secret keys
- Canlı ödeme için ayrıca açık onay
```

---

### 4.6 Çakışmaları önlemek için sınırlar koyuldu

Public Marketing/Billing Codex başlığına şu çalışma kuralları verildi:

```text
- Ana Mac app ve logged-in web portal başka Codex başlığında gelişmeye devam ediyor.
- Bu başlık sadece public site ve billing planning için.
- High-risk shared dosyalara dokunmadan önce rapor ver.
- functions/index.js gibi ortak dosyaları komple rewrite etme.
- Stripe kodunu mümkün olduğunca functions/stripeBilling.js içinde izole tut.
- Swift dosyalarına dokunma.
- Canlı Stripe açma.
```

Riskli ortak dosyalar:

```text
functions/index.js
functions/package.json
functions/package-lock.json
studioflow-web/app/globals.css
studioflow-web/components/PublicMarketing.tsx
studioflow-web/app/plan/page.tsx
studioflow-web/lib/studioflow/firestore.ts
```

Codex bundan sonra değişiklik yapmadan önce çakışma riskini raporlamalıdır.

---

### 4.7 Stripe scaffold’un gerçek dosyalara uygulandığı doğrulandı

Codex şu doğrulamayı yaptı:

```text
- functions/stripeBilling.js exists.
- The temporary apply script was removed.
- functions/index.js imports/exports createStripeBillingFunctions.
- Existing key functions are still present:
  - updateWebOrder
  - createWebOrder
  - Client Files actions
  - Team actions
  - card layout functions
  - plan guards
  - role normalization
```

Bu iyi bir durum, ama yine de yeni public/billing değişikliklerinde `functions/index.js` gibi ortak dosyalar dikkatle incelenmelidir.

---

## 5. Public Marketing/Billing başlığında mevcut kurallar

Bu başlıkta:

```text
- Swift dosyalarına dokunma.
- Logged-in portal behavior değiştirme.
- Canlı ödeme açma.
- Gerçek Stripe live key veya live price ekleme.
- STRIPE_BILLING_ENABLED=false kalmalı.
- STRIPE_ALLOW_LIVE_BILLING=false kalmalı.
- 3000 portunu kullanma.
- Public site için 3002, gerekirse 3003 kullan.
```

High-risk shared dosya editlenmeden önce Codex şunları raporlamalı:

```text
1. Hangi dosya değişecek?
2. Bu dosya ana app/web geliştirme başlığıyla çakışabilir mi?
3. Neden bu dosyaya dokunmak gerekli?
4. Değişiklik küçük ve hedefli mi?
5. Canlı billing açıyor mu?
```

---

## 6. Public site için sıradaki mantıklı adımlar

Public website tarafında sıradaki işler:

```text
1. Public site çok dilli altyapı
2. Dil seçici
3. Public homepage / pricing / features metinlerinin dictionary’ye taşınması
4. Türkçe dahil ilk dil seti
5. Public site SEO metadata
6. Pricing copy iyileştirme
7. FAQ içeriklerini geliştirme
8. Privacy / Terms taslaklarını daha düzgün hale getirme
9. Mobile public site polish
10. Stripe test setup için dashboard checklist
```

Şimdilik yapılmaması gerekenler:

```text
- Canlı ödeme açmak
- Gerçek Stripe charge başlatmak
- App Store / StoreKit production billing bağlamak
- Google Play / Windows billing başlatmak
- Logged-in portal feature geliştirmek
```

---

## 7. Public website multilingual infrastructure - sıradaki önerilen görev

Bir sonraki güvenli görev:

```text
Public website için multilingual infrastructure ekle.
```

Hedef:

```text
- Dil seçici
- localStorage ile dil hatırlama
- İngilizce fallback
- Türkçe dahil ilk dil seti
- PublicMarketing içindeki hard-coded metinleri dictionary’ye taşıma
- Privacy / Terms için başlık ve özetleri çevrilebilir yapma
```

İlk dil listesi:

```text
English
Turkish
German
French
Spanish
Italian
Portuguese
Dutch
Arabic
Japanese
Chinese
```

Çok önemli:

```text
Bu task gerçek ödeme kodu eklememeli.
Swift dosyalarına dokunmamalı.
Logged-in portal behavior değiştirmemeli.
```

---

## 8. Public Marketing Codex başlığına verilecek kısa devam promptu

Yeni Codex başlığında veya devam görevinde şu metin kullanılabilir:

```text
Bu Codex başlığı sadece StudioFlow public marketing website, pricing, signup, public pages, localization, SEO ve safe billing planning içindir.

Ana Mac/iOS app ve logged-in web portal başka bir Codex başlığında aktif geliştirilmeye devam ediyor. Bu yüzden bu başlıkta Swift dosyalarına dokunma ve logged-in portal özelliklerini değiştirme.

localhost:3000 diğer aktif web/app test session için ayrıldı. Public siteyi test ederken 3002 kullan:
npm run dev -- -p 3002
3002 doluysa 3003 kullan.

Stripe billing şu an sadece test-mode scaffold olarak kalmalı:
STRIPE_BILLING_ENABLED=false
STRIPE_ALLOW_LIVE_BILLING=false

Canlı ödeme açma. Gerçek Stripe key veya production price ekleme.

Sıradaki görev:
Public website için multilingual infrastructure ekle. Dil seçici, localStorage ile dil hatırlama, English fallback, homepage/features/pricing/signup/FAQ/contact metinlerini translation dictionary’ye taşı. Privacy/Terms başlık ve özetleri çevrilebilir olsun, uzun legal body şimdilik English fallback olabilir.

Değişiklik yapmadan önce high-risk shared dosyaları kontrol et ve çakışma riski varsa önce raporla.
```

---

## 9. Public site ve billing için daha sonra yapılacaklar

Multilingual altyapıdan sonra:

```text
1. Public homepage metinlerini daha profesyonel hale getirme
2. Pricing page copy netleştirme
3. Pricing cards üzerinde plan farklarını daha açık anlatma
4. FAQ içeriklerini gerçek kullanıcı sorularına göre doldurma
5. Contact page için doğru destek/iletişim akışı
6. Privacy / Terms taslaklarını gerçek hukuki metinlere yaklaştırma
7. SEO metadata
8. Open Graph / social preview
9. Public site mobile polish
10. Stripe test dashboard setup checklist
11. Stripe test checkout’u sadece test mode’da açma
```

---

## 10. Stripe canlı ödeme için not

Canlı ödeme açılmadan önce mutlaka şu adımlar tamamlanmalı:

```text
- Stripe test products/prices oluşturulmalı.
- Stripe test webhook çalışmalı.
- Customer Portal test mode ayarlanmalı.
- Stripe CLI ile webhook test edilmeli.
- Plan state Firebase’de doğru güncellenmeli.
- Pro/Team iptal olunca Free/Demo fallback çalışmalı.
- Export/download existing data fallback sonrası açık kalmalı.
- Apple StoreKit ile merkezi billing state çakışmamalı.
- STRIPE_ALLOW_LIVE_BILLING=true sadece açık onaydan sonra yapılmalı.
```

Şimdilik canlı ödeme kapalı kalmalı.

---

## 11. Bu başlığın dışında kalması gereken konular

Aşağıdaki işler **ana app/web geliştirme başlığında** devam etmeli, bu Public Marketing/Billing başlığında değil:

```text
- Apple-to-Web Feature Parity Matrix
- updateWebOrder Owner permission bug
- Order detail kart fonksiyonları
- Client Files iç uygulama özellikleri
- Team Access
- Card profiles
- Workspace Blocks
- Dashboard hesaplama
- Schedule
- Customers logged-in portal
- Settings gerçek fonksiyonlar
- Swift app build / TestFlight
- Windows native app planı
- Android native app planı
```

---

## 12. Yeni Codex başlığı için ilk mesaj

Yeni public marketing/billing başlığı açıldığında şu mesajla başlayabilirsin:

```text
Please read this file first:
PUBLIC_MARKETING_CODEX_CONTINUE_TR.md

This Codex thread is only for StudioFlow public marketing website, pricing, signup, localization, SEO, and safe billing planning.

Do not edit Swift app files.
Do not change logged-in portal behavior.
Do not enable live Stripe billing.
Use port 3002 for local public website testing, not 3000.
Before changing high-risk shared files, report the conflict risk first.

After reading the context, confirm:
1. What this thread is allowed to work on.
2. What this thread must not touch.
3. Which port to use.
4. What the next recommended task is.
Do not make code changes until I give the next task.
```
