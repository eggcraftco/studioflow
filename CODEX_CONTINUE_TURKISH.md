# StudioFlow by EGGcraft - Codex Devam Hafızası

Bu dosya yeni Codex başlıklarında StudioFlow projesine kaldığımız yerden devam etmek için kullanılır.

Yeni başlıkta ilk mesajda şunu söyle:

```text
Lütfen önce PROJECT_CONTEXT.md, CHANGELOG_STUDIOFLOW.md ve CODEX_CONTINUE_TURKISH.md dosyalarını oku. Sonra kaldığımız yerden devam et.
```

## Dil ve çalışma tarzı

- Türkçe cevap ver.
- Kullanıcı "devam et" dediğinde sıradaki küçük ve güvenli işi seçip ilerle.
- Gereksiz soru sorma; önce dosyaları incele, sonra küçük hedefli patch yap.
- Uygulamada istenen özelliğin hangi dosyaya, hangi platforma ve hangi Firebase path'e bağlı olduğunu kendin bul.
- Riskli bir konuda önce ilgili Swift/Web/Functions kodunu incele ve en güvenli çözümü seç.

## Önce mutlaka oku

- `/Users/gunesgocmen/Desktop/finance/EGGcraft/PROJECT_CONTEXT.md`
- `/Users/gunesgocmen/Desktop/finance/EGGcraft/CHANGELOG_STUDIOFLOW.md`
- `/Users/gunesgocmen/Desktop/finance/EGGcraft/CODEX_CONTINUE_TURKISH.md`

## Proje yolları

Ana proje:

```text
/Users/gunesgocmen/Desktop/finance/EGGcraft
```

Swift app:

```text
/Users/gunesgocmen/Desktop/finance/EGGcraft/EGGcraft
```

Firebase Functions:

```text
/Users/gunesgocmen/Desktop/finance/EGGcraft/functions
```

Web portal + public site:

```text
/Users/gunesgocmen/Desktop/finance/EGGcraft/studioflow-web
```

Android native app:

```text
/Users/gunesgocmen/Desktop/finance/EGGcraft/studioflow-android
```

Web staging GitHub repo:

```text
https://github.com/eggcraftco/studioflow
```

Hostinger staging:

```text
https://lightslategray-pheasant-732922.hostingersite.com
```

Hostinger staging sadece web/public site ve browser web app içindir. iOS/Mac app geliştirmesi ana projede devam eder.

Aynı web repo altında:

- `/` public marketing site
- `/pricing`, `/features`, `/contact` public sayfalar
- `/login`, `/dashboard`, `/orders`, `/customers`, `/settings` browser app sayfaları

## Genel kurallar

- Küçük, hedefli edit yap.
- Whole folder replace yapma.
- Klasör silme veya komple değiştirme.
- İlgisiz refactor yapma.
- `.env.local`, `node_modules`, `.next`, `.next-corrupt-cache*`, build/cache dosyalarına dokunma ve push etme.
- Swift dosyalarını sadece gerçekten gerekiyorsa değiştir.
- Web/public site değişirse `studioflow-web` içinde çalış.
- Functions değişirse Firebase deploy gerekebilir; kullanıcı deploy için genel izin verdi.
- Web dev server açıksa tekrar hatırlatma. Sadece kapalıysa `npm run dev` gerektiğini söyle veya gerekirse çalıştır.
- Çok fazla açık process oluşmasın; gereksiz dev server başlatma.

## Kontrol komutları

Web değişince:

```bash
cd /Users/gunesgocmen/Desktop/finance/EGGcraft/studioflow-web
npm run typecheck
npm run build
```

Functions değişince:

```bash
cd /Users/gunesgocmen/Desktop/finance/EGGcraft/functions
node --check index.js
cd /Users/gunesgocmen/Desktop/finance/EGGcraft
firebase deploy --only functions
```

Storage rules değişince:

```bash
cd /Users/gunesgocmen/Desktop/finance/EGGcraft
firebase deploy --only storage
```

Swift değişince mümkünse:

```bash
cd /Users/gunesgocmen/Desktop/finance/EGGcraft
xcodebuild -project EGGcraft.xcodeproj -scheme EGGcraft -configuration Debug -destination 'platform=macOS' build -quiet
```

## Firebase / data mimarisi

- Orders/projects Swift app tarafında `siparisler` koleksiyonuna bağlı görünüyor. Değişiklik yapmadan ilgili helperları incele.
- Workspace/company bilgileri `companies/{workspaceId}` altında.
- Team members / roles `companies/{workspaceId}.members` veya ilgili workspace access kayıtlarıyla çalışıyor.
- Role normalize logic'e dikkat et. Permission logic display label ile değil canonical role ile çalışmalı.
- Card profile / workspace layout app-compatible storage:
  `companySettings/{workspaceId}.workspaceUserProfilesJSON`
- Card profile içinde önemli alanlar:
  - `kartYerlesimi`
  - `sutunGenislikleri`
  - `kartYukseklikleri`
  - `kartRenkleri`
  - `phoneKartSirasi`
  - `visibility`
- Independent order layout sistemi ayrıca destekleniyor. Shared layout ile independent layout karıştırılmamalı.
- Client Files Storage path:
  `companies/{workspaceId}/client_files/{orderId}/...`
- Client file metadata ilgili order document içindeki `clientFiles` array/map yapısıyla senkron tutuluyor.
- History/log yapısı Swift app ile uyumlu tutulmalı.
- Customer data hem Customers menüsü hem Customer & Communication kartıyla senkron olmalı.
- Quick Reply settings, API key ve company knowledge gibi bilgiler tüm platformlarda aynı workspace settings yapısına kaydedilmeli.
- Public site/billing ile logged-in app portal logic birbirinden ayrılmalı.

## Backend / Functions dikkat noktaları

- `functions/index.js` içinde role/permission/plan guard logic var.
- `updateWebOrder` safe allow-list ile order update yapıyor.
- `createWebOrder`, `createSwiftOrder`, `saveSwiftOrder` create/save akışlarında kullanılıyor.
- `appendClientFile` ve client file helperları Storage + metadata için önemli.
- Plan guard / role guard değişirse Swift app, web portal ve Functions birlikte kontrol edilmeli.

Canonical role values:

- `owner`
- `admin`
- `member`
- `workflowOnly`
- `viewOnly`
- `unknown`

Permission hedefi:

- Owner/Admin/Member: full edit.
- Workflow Only: finance görmez, ama finance dışındaki order/workflow alanlarını düzenleyebilir.
- View Only/Unknown: read-only.
- Custom roles: web ve app aynı custom role/member access mantığını okumalı.

## Plan / üyelik kararları

Planlar:

- Free / Demo
- Lifetime Lite
- Pro Monthly
- Team Monthly

Kurallar:

- Pro veya Team abonelik iptal olursa ya da süresi biterse kullanıcı Lite'a değil Free/Demo'ya düşmeli.
- Free/Demo'ya düşse bile kullanıcı mevcut project/order ve data export/download yapabilmeli.
- 100 GB ve 200 GB storage add-on paketleri ileride desteklenmeli.
- Cloud maliyeti çıkaran özellikler Pro/Team tarafında kalmalı.
- Team Access, role management ve shared workspace özellikleri Team tarafında kalmalı.
- To Do Assign sadece Team planında açık olmalı.
- Demo/Free'de Financial Info kartı görünür ama sadece Paid ve Cost/Base Cost düzenlenebilir. Advanced finance alanları kilitli kalır.

## Şu ana kadar yapılan ana işler

- Web Orders SwiftUI app'e benzer split-view yapıldı.
- Sol order/project listesi + sağ detail workspace yapıldı.
- Order detail cards app Card Profile sistemiyle senkronlandı.
- Kart görünürlüğü, sıralama, renk, yükseklik, desktop/mobile düzeni app ile uyumlu hale getirildi.
- Independent order layout web/Mac senkronlandı.
- Kart resize çubuğu app mantığına yaklaştırıldı.
- Kartlar boş sütunlara ve kart altlarına drop edilebilir hale getirildi.
- Web ve Mac için pan/drag scroll davranışları geliştirildi.
- Client Files web'e eklendi: list, upload, open/download, rename/delete, preview, use in preview.
- Client Files Pro/Team erişim kuralı, Workflow Only izinleri ve Firebase Storage izinleri düzeltildi.
- Client Files kartı Mac/web app tarzına yaklaştırıldı.
- History Log uzun isim taşmaları düzeltildi.
- Add Order davranışı app gibi blank/default project oluşturacak şekilde değiştirildi.
- Order görünen bazı kullanıcı metinleri Project olarak değiştirildi.
- Inline editing eklendi: Customer & Communication, Timeline & Delivery, Production Status, Priority/Risk, Financial Info, To Do.
- Financial Info inline edit ve hesaplar düzeltildi.
- Workflow Only rolü yeniden düzenlendi: finance görmez, ama diğer order/workflow alanlarını düzenleyebilir.
- View Only düzenleyemez.
- Owner/Admin/Member tam düzenleyebilir.
- Custom roles sistemi başladı: Team Access içinde özel rol ve permission yönetimi eklendi; Mac/Web uyumu hâlâ dikkat istiyor.
- Customers web'e getirildi ve müşteri detayları/order history/notlar senkronlandı.
- Customer silinince ilgili project/order fallback mantığı düzeltildi.
- Customer adı canlı yazarken duplicate customer oluşması azaltıldı.
- Dashboard Swift formüllerine yaklaştırıldı.
- Settings web'e app benzeri sidebar + content layout olarak taşındı.
- Theme & Branding, Language & Labels, Financial Settings, Quick Reply Settings, Account, Team Access bölümleri eklendi/iyileştirildi.
- Language değişimi web/app arasında senkron çalışacak hale getirildi.
- Account profil adı/avatar/workspace logo senkron sorunları büyük ölçüde çözüldü.
- Export/backup import uyumu web/app arasında geliştirildi.
- Schedule app'e yaklaştırıldı: sol order listesi, timeline, filter/smart/recent, mobile layout, search icon, zoom çalışmaları.
- To Do kartında task ekleme/silme/done/menu/PDF export/filtreler geliştirildi.
- Work Time kartı eklendi: start/stop/continue/delete, günlük gruplama, toplam süre, web/Mac sync.
- Dark mode üzerinde çok çalışma yapıldı; web hâlâ Mac dark mode ile ince ayar istiyor.
- Web Cards Locked davranışı geliştirildi: yetkisi olmayan roller drag/resize/color/layout edit yapamıyor, lock/unlock ikonları ve i18n metinleri eklendi.
- Web tema bootstrap eklendi: kayıtlı app teması hydration öncesi html/body üzerine yazılıyor, light/dark flash riski azaltıldı.
- Web Customer & Communication channel pill taşmaları ve Schedule & Alerts dar alan Date/Time/Priority çakışmaları için küçük CSS düzeltmeleri yapıldı.
- Mac'in web'de oluşturulan bazı project/order kayıtlarını görmemesi düzeltildi: web kayıtlarında eksik olabilen `assignedToUid` / `assignedToEmail` alanları için Mac fallback decoder eklendi.
- Functions `createWebOrder`, `importWorkspaceBackup`, `woocommerceOrderWebhook` payloadları Mac uyumlu assignment/work session defaultları yazacak şekilde güncellendi ve deploy edildi.
- Web Team Access > Role Profiles içinde `Assigned Projects Only` toggle'ı ve `Financial Info` permission kaydı güçlendirildi: web editör eksik izin anahtarlarını defaultlarla tamamlıyor, custom role özetinde assigned-only doğru görünüyor, Team Access callable fonksiyonları targeted deploy edildi.
- Web Role Permissions UI artık Navigation & Menus, Order Detail Cards ve Project Assignment bölümlerine ayrıldı. Her Order Detail kartı için ayrı permission key eklendi (`cardPreview`, `cardSummary`, `cardCustomer`, `cardMaterials`, `cardPriority`, `cardDelivery`, `cardNotes`, `cardClientFiles`, `cardTodo`, `cardWorkTime`, `cardFinancial`, `cardStatus`, `cardShipping`, `cardSchedule`, `cardHistoryLog`) ve web order detail bu izinlere göre kartları gizliyor. Functions Team Access callable'ları yeni access schema ile deploy edildi.
- Web Team Access içine Mac'teki Request Access ve Invite People akışı taşındı: kullanıcı her rol/planda Owner Company ID ile access request gönderebiliyor, owner Team planında Company ID kopyalayıp davet akışını kullanabiliyor, Join Requests mevcut role/custom role approve ve decline kurallarıyla kalıyor. Yeni `requestWorkspaceAccess` Firebase callable function oluşturuldu ve deploy edildi.
- Mac Team Access > Role Profiles bölümü web'deki Custom Access Roles ile eşitlendi: aynı standard role seçenekleri, aynı access key listesi, Navigation & Menus / Order Detail Cards / Project Assignment grupları, duplicate role adı engeli, dirty-state Save davranışı ve save/delete callable akışı Mac'e taşındı. Mac Sipariş Detay kartları artık aynı `card*` permission key'lerine göre gizleniyor.
- Mac Team Access içindeki eski `Advanced: add member manually` formu kaldırıldı. Artık kullanıcı ekleme akışı Invite People / Request Access / Join Requests üzerinden yürümeli; Firebase UID ile manuel ekleme owner UI'ında görünmemeli.
- Mac Team Access'e web'deki `Current role mix` bölümü eklendi. Team Members listesindeki `roleLabel` değerlerini sayıyor; standard roller ve custom role isimleri ayrı tile olarak görünüyor.
- Team Access request akışı Mac ve web'de artık owner email veya Company ID kabul ediyor. `requestWorkspaceAccess` callable içinde email girilirse Firebase Auth/companies üzerinden owner workspace ID çözülüyor; Company ID girilirse eski davranış korunuyor. Function `requestWorkspaceAccess` deploy edildi.
- Android küçük order/project kartları iPhone/Mac referansına yaklaştırıldı: preview görseli/placeholder, müşteri adı, teslim gün rozeti, assigned kişi rozeti/adı, design ve tarih ikon satırları, DESI/PAIN durum pill'leri ve yeşil GBP tutarı aynı dikey kart içinde gösteriliyor. Telefon compact ölçüleri ayrı, tablet/desktop master list ölçüleri daha geniş tutuluyor. Görünür liste kartı `Assign` butonu kaldırıldı; assignment artık referanstaki gibi sadece `Assigned to ...` satırıyla gösteriliyor. Pixel 8 UI dump `Artur Bezerra`, `8d`, `Assigned to ticktonbenim ismim`, `Tennis_2`, `18/04/26`, `DESI Done`, `PAIN Not Yet`, `£778.00` alanlarını doğruladı; Pixel 8, Pixel Tablet ve Large Desktop assemble/install/logcat temiz geçti.
- Android Large Desktop artık telefon boyutunda freeform pencere yerine büyük masaüstü penceresiyle açılıyor. `AndroidManifest.xml` içinde MainActivity için `resizeableActivity` ve freeform `layout` default/min ölçüleri eklendi; Large Desktop 1920x1080 ekranda StudioFlow'u merkezde 1440x960 dp açıyor, tablet tam ekran kalıyor. Unlock sonrası Large Desktop ve Pixel Tablet wide layout'a geçiyor; assemble/install/logcat temiz geçti.

## Web staging / GitHub durumu

Web repo:

```text
https://github.com/eggcraftco/studioflow
```

Hostinger main branch'ten deploy ediyor.

Web değişikliklerinden sonra:

1. `/Users/gunesgocmen/Desktop/finance/EGGcraft/studioflow-web` içinde çalış.
2. `npm run typecheck`
3. `npm run build`
4. Git commit/push to main.
5. Hostinger staging güncellenir.

Son bilinen push commitleri:

- `97253b2 Add layout lock styles`
- `be734c7 Publish latest role and order updates`
- `513a54e Publish latest web app updates`

Daha sonra lokal değişiklikler oluşmuş olabilir. Önce `git status` kontrol et.

Sadece source dosyalarını commit et. `.next`, cache, env ve dependency dosyalarını asla dahil etme.

## Public marketing / billing durumu

- Public site ve logged-in web app aynı Next.js repo içinde.
- Public SEO metadata helper:
  `studioflow-web/lib/publicSite/metadata.ts`
- Public route metadata sayfaları mevcut olabilir:
  `/`, `/features`, `/pricing`, `/signup`, `/faq`, `/privacy`, `/terms`, `/contact`
- Login metadata için:
  `studioflow-web/app/login/layout.tsx`
- Public translation/copy:
  `studioflow-web/lib/publicSite/translations.ts`
- Public i18n provider:
  `studioflow-web/lib/publicSite/i18n.tsx`
- Public language localStorage key:
  `studioflow-public-language`
- Stripe scaffold mevcut olabilir ama live billing güvenli varsayımla kapalı tutulmalı:
  - `STRIPE_BILLING_ENABLED=false`
  - `STRIPE_ALLOW_LIVE_BILLING=false`
- Stripe/Firebase billing değişirse çok dikkatli ilerle.

## Son doğrulanan durum

- Web typecheck geçti.
- Web build geçti.
- Son bilinen değişikliklerde Functions değişmedi.
- 2026-05-09 doğrulaması: `npm run typecheck` ve `npm run build` web içinde geçti.
- 2026-05-09 sync fix doğrulaması: `node --check functions/index.js` geçti; macOS `xcodebuild` geçti; `firebase deploy --only functions:createWebOrder,functions:importWorkspaceBackup,functions:woocommerceOrderWebhook` başarılı.
- 2026-05-09 finans sync fix doğrulaması: Mac seçili sipariş state'i artık Firestore snapshot'tan finans alanlarını da alıyor; `xcodebuild` geçti; `node --check functions/index.js` geçti; `firebase deploy --only functions:updateWebOrder` başarılı.
- 2026-05-09 küçük order kartı assigned-to düzeltmesi: Mac ve web küçük order kartları artık assigned kişinin email adresi yerine display name gösteriyor; display name yoksa email'in yerel kısmından okunabilir isim türetiyor. Doğrulama: web `npm run typecheck` ve `npm run build` geçti; macOS `xcodebuild -project EGGcraft.xcodeproj -scheme EGGcraft -configuration Debug -destination platform=macOS -quiet build` geçti.
- 2026-05-09 web Owner testing controls: Mac Settings > Plan & Access içindeki geçici owner-only manuel plan switch paneli web Settings > Plan & Access bölümüne taşındı. Web helper `billingPlan`, `billingPlanName`, `billingPlanSource=manual_workspace`, `billingStorageLimitMB`, `billingTeamMemberLimit` ve timestamp alanlarını Mac ile aynı mantıkta güncelliyor; kayıttan sonra workspace context yeniden okunuyor. Doğrulama: web `npm run typecheck` ve `npm run build` geçti.
- 2026-05-09 assignment permission: Mac ve web Role Permissions içine `Change Project Assignments` izni eklendi. `Assigned Projects Only` artık sadece kullanıcıya görünen projeleri kısıtlıyor; assign/reassign yetkisi bu yeni izne bağlı. Owner her zaman assign edebilir, owner olmayan kullanıcılar bu izin kapalıysa küçük kart sağ-tık menüsünde Assign Project bölümünü görmez ve web `updateWebOrder` backend'i de assignment değişimini reddeder. Deploy: `updateWebOrder`, `saveWorkspaceCustomRole`, `updateWorkspaceMemberAccess`, `addWorkspaceTeamMember`, `approveWorkspaceJoinRequest`, `updateWorkspaceMemberRole`, `syncWorkspaceAcceptedJoinRequests` başarılı. Doğrulama: `node --check functions/index.js`, web `npm run typecheck`, web `npm run build`, macOS `xcodebuild ... build` geçti.
- 2026-05-09 Android başlangıcı: `studioflow-android` altında native Kotlin + Jetpack Compose + Material 3 projesi oluşturuldu. İlk milestone login, aynı Firebase hesabıyla workspace okuma, canlı Firestore order listesi, iPhone benzeri küçük order kartları ve `manageProjectAssignments` iznine göre assignment kontrolünü kapsıyor. Paket adı `uk.co.eggcraft.studioflow`; Firebase projesi `eggcraft-studio`; Functions region `europe-west2`. Build dosyalarında AGP `9.2.0`, Kotlin `2.3.21`, Compose BOM `2026.04.01`, Google Services `4.4.4`, Firebase BoM `34.7.0` kullanılıyor. Firebase Android app `StudioFlow Android` oluşturuldu (`1:477037475099:android:3c9298418e394e19038fbe`) ve yerel ignored `studioflow-android/app/google-services.json` indirildi. Bu makinede Android Studio / Android SDK / Gradle / Java runtime olmadığı için Android build çalıştırılamadı.
- 2026-05-10 Android Gradle sync fix: Android Studio Panda 4 / AGP 9 ayrı `org.jetbrains.kotlin.android` plugin'ini reddettiği için `studioflow-android/build.gradle.kts` ve `studioflow-android/app/build.gradle.kts` içinden kaldırıldı. Kullanıcı Android Studio'da `Try Again` / Gradle sync tekrar çalıştırmalı.
- 2026-05-10 Android Gradle wrapper fix: AGP `9.2.0` en az Gradle `9.4.1` istediği için `studioflow-android/gradle/wrapper/gradle-wrapper.properties` içindeki distribution `gradle-9.4.1-bin.zip` yapıldı. Kullanıcı tekrar Gradle sync çalıştırmalı.
- 2026-05-10 Android crash fix: Emulator'da uygulama kullanıcı yazdıktan/oturum açtıktan sonra kapanıyordu. Logcat sebebi olarak Firestore `FAILED_PRECONDITION` composite index ihtiyacını gösterdi (`siparisler`: `companyId` + `paymentDate`). İlk Android listesinde server-side `orderBy("paymentDate")` kaldırıldı, sıralama client-side bırakıldı ve `ordersFlow` / `teamMembersFlow` collect işlemlerine `catch` eklendi; artık Firestore listener hatası uygulamayı kapatmamalı.
- 2026-05-10 Android order detail parity slice: Küçük order kartına dokununca native Compose detay ekranı açılıyor. İlk detay ekranı iPhone'daki dikey kart mantığına göre `Order Summary`, `Customer & Communication`, `Timeline & Delivery`, `Priority/Risk/Materials`, `Financial Info`, `Production Status`, `Shipping & Tracking`, `Notes`, `Files/To Do/Work Time` özetlerini gösteriyor. `StudioOrder` modeli Swift `Siparis` alanlarıyla genişletildi (`remainingAmount`, `watchPurchasePrice`, `paymentFee`, `deliveryCost`, `taxAmount`, contact alanları, notes, tracking, inventory, extraStatuses, customFields/customToggles, clientFiles/todo/workSessions count). Android `WorkspaceMemberAccess` artık web/Mac card permission key'lerini de okuyor (`cardSummary`, `cardCustomer`, `cardFinancial`, vb.). Doğrulama: `JAVA_HOME=/Applications/Android\\ Studio.app/Contents/jbr/Contents/Home ./gradlew :app:assembleDebug` geçti; `:app:installDebug` ile emulator'a kuruldu; UI dump'ta detay ekranında `Order Summary`, `Customer & Communication`, `Production Status` göründü; logcat'te crash/Firebase hata yok.
- 2026-05-10 Android iPhone shell/screens parity: Android logged-in ana ekranı iPhone görüntülerindeki üst EGGcraft header, view/cloud butonları, `+ Add Project`, hamburger menü ve status bar güvenli alanıyla yenilendi. Menü artık Mac/web role permission navigation key'lerini okuyor: `dashboard`, `orders`, `schedule`, `customers`, `quickReply`, `settings`; kapalı bölümler Android menüsünde görünmemeli. Dashboard, Orders, Schedule, Customers, AI Quick Reply Assistant ve Settings için ilk native Compose ekranları eklendi. `+ Add Project` gerçek `createWebOrder` callable'ına bağlı, ancak testte canlı veri oluşturmamak için basılmadı. Order detail custom field gösterimi internal `__...`, `scheduleAlertItemsV1`, `reminderItemsV1` ve `financialExpense::...` gibi namespace alanlarını gizleyecek şekilde düzeltildi. Doğrulama: `:app:assembleDebug` geçti; `:app:installDebug` ile Pixel 8 emülatöre kuruldu; UI dump ile Dashboard (`Net Profit Analysis`), Schedule (`Weekly`, `Team includes...`), Customers (`65 customers`), Quick Reply (`AI Quick Reply Assistant`), Settings (`Theme & Branding`, `Financial Settings`) ve order detail (`Order Summary`, `Customer & Communication`) açıldı; son logcat `AndroidRuntime`, `System.err`, `FirebaseFirestore` hata çıktısı vermedi.
- 2026-05-10 Android parity second pass: Dashboard `Year/Month/All Time` period kontrolü ve `Compare` state'i metrikleri canlı güncelliyor; Orders filtre menüsü `All/Active/Late/Ready to Ship/Completed/Cancelled` ve `Smart Sort/Recent Sort` seçeneklerini açıyor; Schedule hafta okları ve zoom/reset kontrolleri ekranda state değiştiriyor; Settings satırları native detay sayfalarına gidiyor; Quick Reply draft üretiminden önce mesaj niyeti algılıyor ve `Clear Draft` ekledi. Doğrulama: `:app:assembleDebug` geçti, `:app:installDebug` Pixel 8'e kuruldu, Dashboard period/compare UI dump'ta `Month` + `Compare On`, Orders dropdown UI dump'ta filter/sort seçenekleri, Schedule dump'ta `Apr 20 - Apr 26` + `114%`, Settings detay dump'ta `Theme & Branding`, `Workspace`, `System/Light/Dark` göründü; Pixel 8 cold launch logcat `AndroidRuntime`, `System.err`, `FirebaseFirestore` hata çıktısı vermedi. Not: adb text injection Quick Reply TextField'a düşmediği için o intent UI'si emulator dump ile değil build/code yolu ile doğrulandı.
- 2026-05-10 Android Settings deep parity: iPhone Settings alt ekranları Android'e genişletildi. Theme & Branding, Language & Labels, Workflow Steps, PDF Export Settings, Quick Reply Settings, Financial Settings, WooCommerce Integration, Safety & Uploads, Data Management, Account, Plan & Access, Team Access ve About artık native Compose detay sayfaları olarak var. Android `companySettings/{companyId}` dinliyor ve tema/dil/workflow/status/PDF/company numbers/card blocks/quick reply/upload safety alanlarını ortak Firebase key'leriyle yazıyor. Account içinde profil kaydetme, email değiştirme, password reset, avatar upload/remove, workspace logo upload/remove; Team Access içinde owner email veya Company ID ile request access; Data Management içinde backup export, CSV export, orders/customers/settings append-only import ve onaylı delete data bağlandı. Doğrulama: `:app:assembleDebug` geçti; `:app:installDebug` üç emülatöre kuruldu; Pixel 8 cold launch `AndroidRuntime`, `System.err`, `FirebaseFirestore` hata çıktısı vermedi; Settings list ve Workflow detail ekran görüntüleri kontrol edildi.
- 2026-05-10 Android tablet/desktop + order detail pass: Android ana shell geniş ekranda kalıcı sol sidebar kullanıyor; Settings geniş ekranda iki kolonlu liste+detail çalışıyor; Orders geniş ekranda liste+seçili proje master-detail çalışıyor; Schedule tablet/desktop genişliklerinde 4 veya 7 günlük grid gösteriyor. Order detail'e Mac tarzı canlı düzenleme kontrolleri eklendi: Customer & Contact, Workflow Controls, Materials & Inventory, Shipping/Tracking, Notes ve Financial Info aynı `updateWebOrder` callable'ına `details`/`finance` patch gönderiyor. Client Files, To Do, Work Time ve History/Log artık gerçek item listelerini okuyor; To Do add/toggle ve Work Time start/stop `todo`/`workTime` patch'leriyle çalışıyor. Doğrulama: `:app:assembleDebug` geçti; `:app:installDebug` Pixel 8, Pixel Tablet ve Large Desktop emülatörlerine kuruldu; üç cihazda cold launch sonrası `AndroidRuntime`, `System.err`, `FirebaseFirestore`, `StudioFlow` hata çıktısı yok.
- 2026-05-10 Android Client Files + operations detail pass: Android order detail Client Files artık native document picker ile PDF/image/PSD/PSB dosya seçiyor, Firebase Storage `companies/{companyId}/client_files/{orderId}/...` yoluna metadata ile yüklüyor, `appendClientFile` callable'ıyla ortak listeye ekliyor, dosyayı açıyor, image dosyayı preview/design link olarak kullanıyor, `renameClientFile` ve `deleteClientFile` callable'larıyla rename/delete yapıyor. To Do artık priority, note, due-in-days, inline edit/save/delete, complete/reopen ve up/down sıralama aksiyonlarına sahip. Work Time artık start/stop yanında eski session'dan continue ve delete destekliyor. Doğrulama: `:app:assembleDebug` geçti; `:app:installDebug` Pixel 8, Pixel Tablet ve Large Desktop'a kuruldu; üç cihazda app foreground/resumed, cold launch logcat `AndroidRuntime`, `System.err`, `FirebaseFirestore`, `StudioFlow` hata çıktısı yok.
- 2026-05-10 Android Team Access deep pass: Android Team Access artık company snapshot'tan custom role profillerini ve member access map'lerini okuyor, owner için `workspaceJoinRequests` pending isteklerini dinliyor. Owner Android'de join request approve/decline yapabilir, approve sırasında standard/custom role seçebilir, üyelerin role'ünü değiştirebilir, üye permission'larını Navigation & Menus / Project Assignment / Order Detail Cards gruplarında açıp kapatabilir, üyeyi kaldırabilir ve custom role create/update/delete işlemlerini `saveWorkspaceCustomRole`, `deleteWorkspaceCustomRole`, `updateWorkspaceMemberRole`, `updateWorkspaceMemberAccess`, `removeWorkspaceTeamMember`, `approveWorkspaceJoinRequest`, `declineWorkspaceJoinRequest` callables ile yapar. Doğrulama: `:app:assembleDebug` geçti; `:app:installDebug` Pixel 8, Pixel Tablet ve Large Desktop'a kuruldu; üç cihazda cold launch logcat `AndroidRuntime`, `System.err`, `FirebaseFirestore`, `StudioFlow` hata çıktısı yok. Not: Kotlin build sadece deprecated AutoMirrored icon uyarıları veriyor.
- 2026-05-10 Android Mac-style order board pass: Android Orders geniş ekranda seçili sipariş detayı artık Mac ekranındaki mantığa yaklaşan yatay, çok kolonlu kart board'a geçiyor. Telefon tek kolon iPhone detay akışını koruyor; tablet split-pane ve geniş desktop penceresinde Preview, Order Summary, Customer & Contact, Notes, Client Files, To Do, Work Time, Schedule & Alerts, Timeline & Delivery, History / Log, Financial Info, Shipping & Tracking, Workflow Controls ve Priority/Materials ayrı kartlar/kolonlar olarak yerleşiyor. Android modeli artık `customFields.__scheduleAlertItemsV1` içindeki Mac/web Schedule & Alerts verisini okuyor; Android board üzerinden reminder ekleme, complete, snooze ve delete aksiyonları `updateWebOrder` içindeki ortak `schedule` patch yoluna gidiyor. Doğrulama: `:app:assembleDebug` geçti; `:app:installDebug` Pixel 8, Pixel Tablet ve Large Desktop'a kuruldu; Pixel Tablet ekran görüntüsünde çok kolonlu board aktif; Pixel 8 telefon detay ekranı tek kolon kaldı; üç cihaz logcat `AndroidRuntime`, `StudioFlow`, `FirebaseFirestore` hata çıktısı vermedi. Not: Large Desktop emülatörü uygulamayı dar freeform pencere içinde açtığında telefon detayını gösteriyor; pencere genişlediğinde aynı 520dp board eşiği devreye girer.
- 2026-05-10 Android Mac-detail continuation pass: Order detail geniş board kartlarında Mac tarzı başlık/alt tutamaç chrome eklendi. Preview kartı artık gerçek `designLink` görselini yükler, link görsel değilse uyarı verir, `Open` ve `Use Latest` ile son image Client File'ı preview olarak kullanabilir. To Do modeli `assignedToUid` okuyor; telefon ve tablet/desktop To Do add/edit/row assignment kontrolleri Team planına bağlı çalışıyor; wide board'da To Do için Top/Bottom taşıma aksiyonları eklendi. Order list kartları ve detail hero artık `designLink` ya da latest image Client File thumbnail'ını gösteriyor; küçük kartlar DESI/PAIN satırları ve iki ondalıklı GBP formatıyla Mac/iPhone'a yaklaştırıldı. Doğrulama: `:app:assembleDebug` ve `:app:installDebug` Pixel 8, Pixel Tablet ve Large Desktop'ta geçti; screenshot kontrolünde telefon tek kolon, tablet split/wide liste ve desktop freeform liste göründü; üç cihaz logcat `AndroidRuntime`, `StudioFlow`, `FirebaseFirestore` hata çıktısı vermedi. Not: İlk görünen test order'larda gerçek image link olmadığı için thumbnail fallback `SF` olarak kaldı; image olan orderlarda aynı kod gerçek görseli render eder.
- 2026-05-10 Android Workspace Blocks/card visibility pass: Android `StudioWorkspaceSettings` artık `showCardClientFiles`, `showCardTodo`, `showCardWorkTime`, `showCardSchedule`, `showCardHistoryLog` alanlarını da okuyor/yazıyor ve `showsCard(key)` helper'ı ile order detail kart görünürlüğünü tek yerde belirliyor. `OrderDetailScreen` telefon, tablet ve desktop board'da role permission ile Workspace Blocks ayarını birlikte kullanıyor; Settings > Workflow Steps > Workspace Blocks içinde Client Files, To Do, Work Time, Schedule & Alerts ve History / Log switch'leri eklendi. Schedule & Alerts telefon tek kolon detail akışına da canlı reminder kartı olarak eklendi; Timeline & Delivery artık Schedule görünürlüğüne bağlı yanlış açılmıyor. Doğrulama: `:app:assembleDebug` ve `:app:installDebug` Pixel 8, Pixel Tablet ve Large Desktop'ta geçti; üç cihaz cold launch logcat `AndroidRuntime`, `StudioFlow`, `FirebaseFirestore` hata çıktısı vermedi.
- 2026-05-10 Web Hostinger client-side exception fix: Canlı `https://lightslategray-pheasant-732922.hostingersite.com/` HTML response'u Hostinger CDN'de eski cache'ten geliyordu (`x-hcdn-cache-status: HIT`, `age` yüksek) ve eski HTML artık sunucuda olmayan `/_next/static/chunks/app/page-12b17c1e213b7960.js` chunk'ını istiyordu; bu chunk 404 dönüyordu. `studioflow-web/app/layout.tsx` root layout'a `dynamic = "force-dynamic"` ve `revalidate = 0` eklendi; `studioflow-web/next.config.ts` non-static route'lara `Cache-Control: no-store, no-cache, max-age=0, must-revalidate`, `Pragma: no-cache`, `Expires: 0` header'ları ekledi; `_next/static` immutable kaldı. `npm run typecheck` ve `npm run build` geçti, build route'ları `ƒ Dynamic` oldu. Commit `01650d1 Fix web HTML cache headers` main'e push edildi. Cache-busting query ile canlı response yeni no-cache header'ları veriyor; düz `/` hâlâ eski HCDN HIT dönebilir, bu yüzden Hostinger CDN cache purge yapılmalı.
- 2026-05-10 Android Financial Settings + Cards Locked pass: Android finans ayarları Mac/Web ile aynı ortak alanlara bağlandı: `seciliParaBirimi`, `seciliOndalik`, `feePercentage`, `taxRuleNameRevenue`, `taxRuleNameProfit`, `defaultTaxRate`, `taxCalculationType`, `taxMilestoneEnabled`, `taxMilestoneDate`. Settings > Financial Settings artık currency/decimal/platform fee/VAT rule/default tax/tax calculation/transition date alanlarını kaydediyor ve kullanıcı özellikle basarsa `recalculateFinancialSettingsForOrders` callable'ını çalıştırabiliyor. Dashboard ve Order Detail para formatları workspace currency/decimal ayarını kullanıyor. Orders tablet/desktop board'a Mac tarzı `Cards Unlocked` / `Cards Locked` butonu ve kart başlığı `Collapse/Expand` menüsü eklendi; Team Access role picker'a Admin eklendi. Doğrulama: `:app:assembleDebug` geçti; `:app:installDebug` Pixel 8, Pixel Tablet ve Large Desktop'ta geçti; üç cihaz launch/logcat `AndroidRuntime`, `StudioFlow`, `FirebaseFirestore` hata çıktısı vermedi. Not: `Recalculate Taxes` QA sırasında canlı sipariş finanslarını değiştirmemek için basılmadı.
- 2026-05-10 Android Account local unlock pass: Mac/iPhone Account > Security içindeki `Require Face ID / device passcode on app launch` Android'de gerçek local ayara bağlandı. `StudioFlowApp` local `SharedPreferences` ile `studioflow_require_local_unlock` değerini saklıyor; mevcut Firebase session ile açılışta `Unlock StudioFlow` perdesi çıkıyor; Android `KeyguardManager` üzerinden fingerprint/face unlock/PIN/pattern/password ekranı isteniyor. Interactive sign-in sonrası ikinci kez kilit sormadan içeri alıyor, Mac'teki `bypassNextLocalUnlockAfterInteractiveSignIn` davranışına denk. Doğrulama: `:app:assembleDebug` geçti; `:app:installDebug` üç emülatöre kuruldu; Pixel 8 UI dump'ta `Unlock StudioFlow` göründü, Unlock butonu screen lock olmayan emülatörde app'e aldı; üç cihaz logcat `AndroidRuntime`, `StudioFlow`, `FirebaseFirestore`, `System.err` hata çıktısı vermedi.
- 2026-05-10 Team Access reference visual pass: Kullanıcının verdiği referans görsele göre Mac, web ve Android Team Access düzeni aynı sıraya yaklaştırıldı. Web `Settings > Team Access`: hero kart, iki kolon `Current Workspace / Workspaces`, iki kolon `Request Access / Invite People`, sonra `Join Requests`, `Role Profiles`, `Team Members`, `Current role mix` sırasına geçti; CSS kart spacing/soft panel görünümü eklendi. Android `SettingsScreen.kt`: Team Access üst blokları telefon tek kolon, tablet/desktop iki kolon olacak şekilde ayrıldı; `Current role mix` ayrı kart oldu; role permission editor switch listesi yerine görseldeki gibi mavi/turuncu/mor renkli toggle kart grid'leri kullanıyor. Mac `ContentView.swift`: Team Access içinde `Current Workspace / Workspaces` ve `Request Access / Invite People` alanları `ViewThatFits` ile geniş ekranda yan yana, dar ekranda alt alta çiziliyor; mevcut Mac custom role permission editor korunuyor. Doğrulama: web `npm run typecheck` ve `npm run build` geçti; Android `:app:assembleDebug`, `:app:installDebug` ve üç cihaz launch/logcat temiz geçti; macOS `xcodebuild -project EGGcraft.xcodeproj -scheme EGGcraft -configuration Debug -destination platform=macOS -quiet build` geçti, yalnız önceki exhaustiveness/MainActor uyarıları kaldı.
- 2026-05-10 Android card layout sync + drag/drop pass: Mac/Web kart sistemi incelendi ve Android'e aynı workspace layout snapshot hattı eklendi. Android `StudioWorkspaceSettings` artık `workspaceUserProfilesJSON`, `sharedWorkspaceSnapshotJSON` ve normalize edilmiş `OrderDetailCardLayout` taşır; repository kullanıcı profil snapshot'ını owner fallback ve shared fallback ile aynı web mantığında seçer. `OrderDetailScreen` telefon akışında iPhone `phoneKartSirasi` sırasını, tablet/desktop board'da Mac/Web `kartYerlesimi` kolonlarını kullanır. Kartlar phone/tablet/desktop'ta Compose drag/drop source/target ile taşınabilir; drop sonrası Android `kartYerlesimi` + `phoneKartSirasi` içeren snapshot'ı hem kullanıcının `workspaceUserProfilesJSON` profiline hem de `sharedWorkspaceSnapshotJSON` fallback'ine yazar. `materials` ve `priority` kartları ayrı render edilir. Doğrulama: `JAVA_HOME=/Applications/Android\\ Studio.app/Contents/jbr/Contents/Home ./gradlew :app:assembleDebug` geçti; APK Pixel 8, Pixel Tablet ve Large Desktop emülatörlerine kuruldu; üç cihaz launch/logcat `AndroidRuntime` / `System.err` hata çıktısı vermedi. Manuel kontrol önerisi: Android tablet/desktop Orders detail'de `Cards Unlocked` açıkken kartı başka kolona sürükle, sonra Mac/Web detailde sıralamanın değiştiğini kontrol et; Android telefonda order detail kart sırasının iPhone `phoneKartSirasi` düzenini takip ettiğini kontrol et.
- 2026-05-10 Web mobile Orders iPhone parity pass: Kullanıcının iPhone Safari web görüntüsü ile iPhone app görüntüsü karşılaştırıldı. Web mobil Orders görünümünde toolbar sıkışması düzeltildi: telefon genişliğinde account avatar gizleniyor, marka için daha fazla alan kalıyor, icon/add/menu kontrolleri daraltıldı. `orders-mobile-list` iPhone app gibi full-width gri zemin + beyaz header bandına geçti; filtre/search satırı büyütüldü. Mobil order kartları tekrar yatay thumbnail / orta proje bilgisi / sağ DESI-BOYA status + fiyat kolonuna alındı; status ve fiyat artık kart altında alt alta kalmamalı. `OrderListCard` içinde `Painting` etiketi `BOYA` kısaltmasına map edildi; Türkçe workspace dilinde `Done`, `Not Yet`, `In Progress`, vb. statuslar küçük kartlarda `Bitti`, `Yapılmadı`, `Yapılıyor` gibi görünür. Doğrulama: web `npm run typecheck` ve `npm run build` geçti. Manuel kontrol: gerçek iPhone Safari'de `/orders` aç, kartların iPhone app görüntüsündeki gibi daha kısa/yatay olduğunu ve header logosunun butonların altına girmediğini kontrol et.
- 2026-05-10 Web Team Access reference top-section polish: Kullanıcının verdiği Team Access referans görseline göre web Settings > Team Access üst bölümü yeniden sıkılaştırıldı. Hero kart büyük mavi team ikonu + başlık/subtitle lockup kullanıyor; `Current Workspace / Workspaces` ve `Request Access / Invite People` iki kolon soft kart düzenine geçti; Current Workspace copy ikonu, Workspaces refresh ikonu, Request Access send ikonu ve Invite People Copy butonu referans görsele yaklaştırıldı. Owner, Current ve Connected pill renkleri ayrıldı; Join Requests artık ikon + subtitle + chevron içeren tam genişlik satır gibi görünüyor. `components/CardTitle.tsx` içine reusable `team` ikonu eklendi. Doğrulama: web `npm run typecheck` ve `npm run build` geçti. Manuel kontrol: web `/settings` > Team Access bölümünde üst hero, 2x2 kart grid ve Join Requests satırını referans görselle karşılaştır; Owner email veya Company ID ile Request Access input'unun hâlâ request gönderdiğini ve Copy/Refresh butonlarının çalıştığını kontrol et.
- 2026-05-10 Android tablet/desktop Mac workspace layout pass: Kullanıcının Mac ekran görüntüsündeki `üstte menü isimleri + solda küçük project kartları + sağda seçili project kart board'u` akışı Android tablet ve Large Desktop'a taşındı. `StudioFlowMainScreen.kt` geniş ekranda sol sidebar yerine Mac/Web tarzı üst yatay nav kullanıyor; Orders, Dashboard, Schedule, Customers, Quick Reply ve Settings isimleri üstte görünüyor. `OrdersScreen.kt` geniş ekranda sol paneli kompakt project/order kart listesine dönüştürüyor, search/filter alanını Mac düzenine yaklaştırıyor ve seçili project yoksa ilk görünür project'i otomatik seçerek sağdaki çok kolonlu detay board'unu açıyor. Doğrulama: `JAVA_HOME=/Applications/Android\\ Studio.app/Contents/jbr/Contents/Home ./gradlew :app:assembleDebug` geçti; `:app:installDebug` Pixel 8, Pixel Tablet ve Large Desktop emülatörlerine kuruldu; UI dump'larda tablet ve Large Desktop üst nav + sol küçük project kartları + sağ Preview/Order Summary/Client Files/To Do/Financial vb. board kartları göründü.
- 2026-05-10 Android tablet/desktop card customization pass: Mac’teki kart profil detaylarının bir kısmı Android geniş board’a taşındı. `OrderDetailScreen.kt` içinde kart menüsü artık `Collapse card`, `Hide block`, `Move to previous/next column`, `Narrow/Widen column` ve `Color: Default/Red/Orange/Yellow/Green/Blue/Purple/Pink` seçeneklerini gösteriyor. Bu seçenekler Android’in okuduğu aynı workspace layout snapshot alanlarına yazıyor: `visibility`, `sutunGenislikleri`, `kartRenkleri`, `kartYerlesimi` ve `phoneKartSirasi`. Gizlenen kartlar board üstünde `Hidden cards` restore strip’i ile geri açılabiliyor. Doğrulama: Android `:app:assembleDebug` geçti; `:app:installDebug` Pixel 8, Pixel Tablet ve Large Desktop’a kuruldu; Large Desktop UI dump’ta yeni kart menüsü seçenekleri göründü; tablet/desktop board açıldı; logcat `AndroidRuntime`, `System.err`, `FirebaseFirestore`, `StudioFlow` hata çıktısı vermedi.
- 2026-05-10 Android card height parity pass: Mac/Web kart yüksekliği snapshot alanları Android’e bağlandı. `StudioModels.kt` `OrderDetailCardLayout` artık `cardHeights` ve `orderCardHeights` taşır; `StudioFlowRepository.kt` shared snapshot içinden `kartYukseklikleri`, `orderKartYukseklikleri` ve alternatif `cardHeights` alanlarını okur. `OrderDetailScreen.kt` geniş board kartlarına kaydedilmiş yüksekliği uygular, kart içeriğini sabit yükseklikte scroll eder ve kart menüsüne `Shorter card`, `Taller card`, `Auto height` ekler. Snapshot yazımı artık bu alanları boş obje olarak ezmez, gerçek yükseklikleri geri yazar. Doğrulama: Android `:app:assembleDebug` geçti; `:app:installDebug` Pixel 8, Pixel Tablet ve Large Desktop’a kuruldu; Large Desktop UI dump’ta `Shorter card`, `Taller card`, `Auto height` göründü; logcat’te app crash yok.
- 2026-05-10 Android board header chrome pass: Mac’teki kart başlığı ikonları incelendi (`photo`, `doc.text`, `person`, `calendar`, `folder`, `timer`, vb.) ve Android tablet/desktop order board kart başlıklarına kart tipine göre ikon + accent eklendi. `DetailCard` artık `OrderDetailCardId` üzerinden icon/accent çözüyor, `::` yerine gerçek `DragHandle`, `...` yerine `MoreHoriz` action icon kullanıyor. Telefon tek kolon detail akışı aynı component’i kullandığı için uyumlu kalır; geniş board görünümü Mac’e daha yakın. Doğrulama: Android `:app:assembleDebug` geçti; `:app:installDebug` Pixel 8, Pixel Tablet ve Large Desktop’a kuruldu; Large Desktop UI dump’ta `Drag card`, `Card actions`, `Preview`, `Order Summary`, `Client Files`, `To Do` başlıkları göründü; logcat’te app crash yok.
- 2026-05-10 Android resize handle pass: Mac `DetayKarti` alt resize davranışına yaklaşmak için Android tablet/desktop board kartlarının alt tutamacı gerçek sürükleme kontrolüne çevrildi. Tutamaç çizgisi ince kaldı ama 18dp yüksekliğinde daha kolay yakalanan hit target var; sürüklerken kart yüksekliği canlı değişiyor, bırakınca `withCardHeight` üzerinden `kartYukseklikleri` / `orderKartYukseklikleri` snapshot alanlarına kaydediliyor. Yükseklik 160-900 dp arasında sınırlandı ve içerik sabit yükseklikte kart içinde scroll ediyor. Doğrulama: Android `:app:assembleDebug` geçti; `:app:installDebug` Pixel 8, Pixel Tablet ve Large Desktop’a kuruldu; Large Desktop board render/logcat temiz. Not: QA sırasında canlı workspace layout’u değiştirmemek için tutamacı fiziksel olarak sürükleyip kayıt yapılmadı; build/render/log yolu doğrulandı.
- 2026-05-10 Android column width edge resize pass: Mac `DetayKarti` sağ kenar genişlik sürükleme davranışı Android tablet/desktop board kolonlarına eklendi. Her `DesktopColumn` sağ kenarında ince görsel rail + 18dp invisible hit target var; sürüklerken kolon genişliği canlı değişiyor, bırakınca `withColumnWidth` üzerinden `sutunGenislikleri` snapshot alanına kaydediliyor. Genişlik 260-800 dp arasında sınırlandı. Menüdeki `Narrow/Widen column` hâlâ çalışır; bu yeni davranış mouse/tablet sürükleme için Mac’e yakın direkt kontrol sağlar. Doğrulama: Android `:app:assembleDebug` geçti; `:app:installDebug` Pixel 8, Pixel Tablet ve Large Desktop’a kuruldu; Large Desktop UI dump’ta `Preview`, `Order Summary`, `Client Files`, `To Do` board kartları render edildi; logcat’te app crash yok. Not: Canlı workspace layout’unu değiştirmemek için QA’da fiziksel sürükleyip kayıt yapılmadı.
- 2026-05-10 Android bottom-right combined resize pass: Mac `DetayKarti` sağ-alt köşe tutamacı Android tablet/desktop board kartlarına taşındı. Kart altındaki merkez çizgi sadece yükseklik resize olarak kaldı; sağ-alt küçük `DragHandle` ise hem kart yüksekliğini hem kolon genişliğini beraber canlı önizler. Bırakınca tek snapshot kaydıyla `withCardHeight(...).withColumnWidth(...)` çalışır ve `kartYukseklikleri` / `orderKartYukseklikleri` + `sutunGenislikleri` birlikte güncellenir. Doğrulama: Android `:app:assembleDebug` geçti; `:app:installDebug` Pixel 8, Pixel Tablet ve Large Desktop’a kuruldu; Large Desktop UI dump’ta `Resize card and column` handle’ları göründü; logcat’te app crash yok. Not: Canlı workspace layout’unu değiştirmemek için QA’da fiziksel sürükleme/kayıt yapılmadı.
- Son değişen web dosyaları:
  - `app/globals.css`
  - `app/settings/page.tsx`
  - `app/orders/page.tsx`
  - `components/OrderListCard.tsx`
  - `components/MemberAccessEditor.tsx`
  - `components/CustomRoleManager.tsx`
  - `lib/studioflow/firestore.ts`
  - `lib/studioflow/settingsActions.ts`
  - `app/layout.tsx`
  - `app/orders/OrderDetailContent.tsx`
  - `app/plan/page.tsx`
  - `app/schedule/page.tsx`
  - `components/AppShell.tsx`
  - `components/CardTitle.tsx`
  - `lib/studioflow/language.ts`
  - `lib/studioflow/orders.ts`

## Öncelikli backlog

1. Mac/Web dark mode tam renk uyumu.
2. Quick Reply Assistant tasarımını verilen modern mockup'a göre Mac ve Web'de yenile.
3. Financial Settings menüsünü verilen mockup'a göre Mac/Web aynı yap.
4. Custom roles / assigned project sistemi:
   - Owner özel rol oluşturabilsin.
   - Her role menü erişimi ve özellik izinleri atanabilsin.
   - Kullanıcı sadece kendine atanmış projectleri görebilsin.
   - Owner küçük project kartına sağ tıklayıp kullanıcı atayabilsin.
   - Atanmış project kartında assigned user bilgisi görünsün.
   - Owner için üst menüye üyeler ve atanmış işler bölümü eklenebilsin.
   - Mac ve web aynı permission modelini kullansın.
5. Cards Locked butonunun Mac davranışını web'e tam taşı.
6. Tüm üst menü ve sayfa içi yazılarda eksik i18n desteğini tamamla.
7. Schedule zoom sistemi ve takvim günlerinin tam görünmesi.
8. Email değiştirme sistemi: değiştikten sonra 10 gün cooldown.
9. Customer & Communication channel pill taşmalarını Mac/Web kısalt.
10. Schedule & Alerts kartında dar alanda Date/Time ve Priority çakışmasını düzelt.
11. Web/Mac card title ikonlarını app ikonlarıyla birebir eşleştir.
12. Team Access görünümünü sadeleştir: roller alt alta, tıklayınca permissions açılsın, çok uzun tek sayfa karmaşası olmasın.
13. Web/public marketing site ve logged-in app değişikliklerini staging repo akışına göre commit/push et.
14. Android ekran parity derinleştirme:
   - Dashboard grafik ve özet satırlarını period/compare seçimine göre daha detaylı hale getir.
   - Orders filtre/search/smart-recent seçenekleri Android'de derinleştirildi: arama assignee/contact/status/custom field alanlarını da kapsıyor, filtre/sort tercihleri workspace bazlı cihazda kalıcı, Mac-style kategori filtreleri ve Delivery due/Recent/Customer/Order value sort modları var. Sıradaki pass istenirse bu tercihler cross-device workspace view preset olarak Firebase'e taşınabilir.
   - Schedule sürükle-bırak ve gerçek sipariş tarih güncelleme işlevlerini taşı; zoom, hafta değiştirme ve tablet/desktop geniş grid eklendi.
   - Quick Reply gerçek workspace ayarları/API akışı Android ana ekrana bağlandı; sıradaki derin pass istenirse API hata/usage geçmişi ve reply template kayıtları olabilir.
   - Settings alt sayfaları ilk Firebase okuma/yazma ve dosya upload parity ile eklendi; Team Access owner yönetimi derinleştirildi; Android device credential foreground re-lock tamamlandı. Sıradaki derin pass gerçek Google Play Billing satın alma akışı ve Team Access UI polish/audit log görünürlüğü.
   - Client Files Android upload/open/use-preview/rename/delete akışı eklendi; sıradaki derin pass dosya paylaşımı/share extension benzeri Android intent ingest, upload progress ve galeri/PDF preview iyileştirmeleri.
   - To Do due/priority/note/edit/delete/move ve Work Time continue/delete eklendi; sırada To Do team member assignment, filtreleme ve Android bildirim/reminder entegrasyonu var.
   - Orders tablet/desktop board Mac benzeri çok kolonlu yapıya geçti; sıradaki derin pass kart sıralama/resize/lock davranışı, gerçek preview image render, Schedule reminder Android notification entegrasyonu ve desktop pencere genişliği polish.
   - 2026-05-10 Android order board card actions polish: tablet/desktop kart menüsünde Mac benzeri renk swatch'ları eklendi; seçili renk mavi çerçeveyle belli oluyor. Aynı menüye `Reset column width` ve `Reset card and column size` eklendi; bu kontroller `sutunGenislikleri`, `kartYukseklikleri` ve `orderKartYukseklikleri` snapshot yapısını bozmadan varsayılan genişlik/otomatik yükseklik davranışına döndürüyor. Doğrulama: `:app:assembleDebug` ve `:app:installDebug` Pixel 8, Pixel Tablet, Large Desktop'ta geçti; Large Desktop UI dump yeni reset/color menü metinlerini gösterdi; üç cihaz launch/logcat temiz.
   - 2026-05-10 Android order board header actions pass: tablet/desktop geniş ekran `Actions` menüsüne Mac benzeri board yönetim aksiyonları eklendi: `Restore all hidden cards`, `Auto-size all cards`, `Reset column widths`, `Reset board layout`. Reset desktop board aksiyonu desktop kolonlarını, renkleri, görünürlükleri ve desktop yüksekliklerini varsayılana döndürürken `phoneKartSirasi` değerini koruyor. Doğrulama: `:app:assembleDebug` ve `:app:installDebug` Pixel 8, Pixel Tablet, Large Desktop'ta geçti; Large Desktop UI dump yeni header action metinlerini gösterdi; üç cihaz launch/logcat temiz. QA sırasında canlı layout değişmesin diye reset aksiyonlarına basılmadı.
   - 2026-05-10 Android Preview card parity pass: telefon/tablet/desktop ortak Preview kartı artık Mac/Web gibi kart içinden foto linki düzenleme/kaydetme/iptal etme ve saved preview linkini kaldırma akışını destekliyor. `designLink` boşsa ilk image client file görsel fallback olarak gösteriliyor; `Use Latest` bu file URL'ini saved preview olarak yazar. Role workflow/edit yetkisi yoksa edit/use/remove kontrolleri pasif kalır, Open çalışmaya devam eder. Doğrulama: `:app:assembleDebug` ve `:app:installDebug` Pixel 8, Pixel Tablet, Large Desktop'ta geçti; Large Desktop UI dump `Paste Link`, `Save Link`, `Cancel`, `Use Latest`, `Remove` kontrollerini gösterdi; üç cihaz launch/logcat temiz. Canlı order verisi değişmesin diye Save/Remove/Use Latest QA sırasında basılmadı.
   - 2026-05-10 Android Preview image upload pass: telefon/tablet/desktop ortak Preview kartına doğrudan `Upload Image` / `Replace Image` eklendi. Android image picker seçilen görseli workspace upload limitine göre doğruluyor, Firebase Storage `companies/{companyId}/design_images/{orderId}/android_preview_...` yoluna ortak metadata ile yüklüyor ve `updateWebOrder` üzerinden `details.designLink` alanını güncelliyor; böylece Mac/Web/iPhone aynı preview linkini okur. Doğrulama: Android `:app:assembleDebug` ve `:app:installDebug` Pixel 8, Pixel Tablet, Large Desktop'ta geçti; Large Desktop UI dump `Preview`, `Open`, `Upload Image`, `Use Latest`, `Paste Link`, `Remove`, `Cancel` kontrollerini gösterdi; üç cihaz launch/logcat temiz. Canlı order verisi değişmesin diye Upload/Remove/Save/Use Latest QA sırasında basılmadı.
   - 2026-05-10 Android Timeline calendar action pass: Mac `Timeline & Delivery` kartındaki takvim aksiyonuna karşılık Android telefon/tablet/desktop kartına `Add to Calendar` eklendi. Buton Android native calendar insert flow'u açar; created/payment date ile delivery due date arasında all-day event oluşturmak üzere customer/project title, design name, order value, delivery label ve varsa address/location benzeri custom field alanını doldurur. Doğrulama: Android `:app:assembleDebug` ve `:app:installDebug` Pixel 8, Pixel Tablet, Large Desktop'ta geçti; Large Desktop board yatay kaydırma sonrası Timeline helper metni UI dump'ta göründü; üç cihaz launch/logcat temiz. QA sırasında app dışına takvim ekranı açmamak için butona basılmadı.
   - 2026-05-10 Android Shipping live tracking pass: Mac `Shipping & Tracking` kartındaki canlı takip sistemi Android telefon/tablet/desktop kartına taşındı. Kart artık Dispatched/Delivered, Courier, Tracking No., `Save Shipping`, `Refresh Live Status`, `Open Tracking`, `Check Again` ve `tracking::...` custom field'larını okuyan 17TRACK tarzı live status paneli içeriyor. Backend `registerTracking` ve `scheduledTrackingRefresh` da güncellendi; tracking sonucu artık sadece delivered olduğunda değil her durumda sipariş `customFields` içine yazılıyor, böylece Mac/Web/Android aynı panel state'ini okur. Doğrulama: `node --check functions/index.js` geçti; `firebase deploy --only functions:registerTracking,functions:scheduledTrackingRefresh` başarılı; Android `:app:assembleDebug` ve `:app:installDebug` Pixel 8, Pixel Tablet, Large Desktop'ta geçti; Large Desktop UI dump `Courier`, `Tracking No.`, `Save Shipping`, `Refresh Live Status`, `No tracking number yet.` metinlerini gösterdi; üç cihaz logcat temiz. QA sırasında dış carrier API isteği atılmasın diye `Refresh Live Status` basılmadı.
   - 2026-05-10 Android shared board scroll pass: Android tablet/desktop Orders detail board artık Mac/Web gibi tek ortak dikey pano scroll'u kullanıyor. Kolonların kendi `verticalScroll` davranışı kaldırıldı; geniş board'da kart içi sabit yükseklik scroll'u yerine kaydedilmiş yükseklikler minimum kart yüksekliği gibi uygulanıyor ve tüm kolon/kartlar aynı board hareketiyle yukarı-aşağı kayıyor. Telefon tek kolon iPhone akışı değişmedi. Kart sürükle-bırak tarafına hedef kartın üstüne bırakma için ince insertion drop zone eklendi; hedef kartın üstü ya da kolon sonu drop edildiğinde aynı `workspaceUserProfilesJSON` / `sharedWorkspaceSnapshotJSON` layout snapshot hattı güncelleniyor. Doğrulama: Android `:app:assembleDebug` ve `:app:installDebug` Pixel 8, Pixel Tablet, Large Desktop'ta geçti; tablet ve Large Desktop UI dump'larında sol liste dışında sağ board için aynı bounds içinde horizontal+vertical scroll göründü; adb swipe sonrası alt board kartları aynı pano içinde göründü; üç cihaz logcat temiz.
   - 2026-05-10 Android Dashboard/Schedule controls pass: Dashboard içinde `Year/Month/All Time` artık gerçek dropdown ile seçiliyor, tune butonu aynı period/compare menüsünü açıyor ve başlıkta seçili period için order/late/ready-to-ship özeti gösteriliyor. Schedule içinde status filter, sort mode, Daily/3 Days/Weekly view mode, arama paneli, tarih reset alanı, oklar ve zoom/reset kontrolleri canlı state'e bağlandı; filtreler grid içeriğini ve footer sayılarını güncelliyor. Doğrulama: Android `:app:assembleDebug` ve `:app:installDebug` Pixel 8, Pixel Tablet, Large Desktop'ta geçti; Large Desktop UI dump status/sort/view dropdownlarını, search panelini, `Active · 2`, `Delivery due`, `3 Days` ve filtrelenmiş 3 günlük grid'i gösterdi; üç cihaz AndroidRuntime logcat temiz.
   - 2026-05-10 Android Dashboard Mac parity expanded: Dashboard içinde Week / Month / Year / All Time dönemleri, `1 Yr Compare` ve `3 Yrs Compare`, compare chart legend/serileri, Year-over-Year summary satırları ve Mac'teki Dashboard Customize kart görünürlüğü Android'e taşındı. Android `dashboardWidgetVisibility` ile `dashShowRevenue`, `dashShowPending`, `dashShowCost`, `dashShowFee`, `dashShowShipping`, `dashShowTax`, `dashShowProfit` alanlarını okuyup yazıyor; Fee/Shipping/Tax gizlenirse toplam Mac gibi Cost içine yuvarlanıyor. Tablet/desktop summary kartları responsive grid halinde daha yoğun görünüyor. Doğrulama: Android `:app:assembleDebug` ve `:app:installDebug` Pixel 8, Pixel Tablet, Large Desktop'ta geçti; tablet UI dump `Week`, `1 Yr Compare`, `3 Yrs Compare`, `Dashboard cards`, widget satırları, geniş summary tile'lar ve compare sonrası `-1 Yr` chart legend'ını doğruladı; üç cihaz AndroidRuntime logcat temiz. Canlı workspace preference değişmesin diye Dashboard visibility toggle'larına QA sırasında basılmadı.
   - 2026-05-10 Android Schedule board parity pass: Schedule tablet/desktop ekranına Mac'teki planlama kolon mantığı eklendi. Mevcut filtre/sıralamaya göre siparişler `Waiting Customer`, `In Production`, `Ready to Ship`, `Late Orders`, `Completed` lane'lerine ayrılıyor; kartlarda müşteri, tasarım, due date, kalan gün badge'i, status label ve varsa assigned kişi adı görünüyor. Status filter menüsü de aynı Mac kategorilerine genişletildi: `Waiting Customer`, `In Production`, `Ready to ship`, `Late Orders`, `Completed`, `Cancelled`; grid/footer sayıları board ile aynı helper'ları kullanıyor. Geniş ekranlarda lane'ler yatay kaydırılan tek board yüzeyinde, sayfanın ortak dikey scroll'u içinde duruyor; telefon akışı tek kolon olarak kalıyor. Doğrulama: Android `:app:assembleDebug` ve `:app:installDebug` Pixel 8, Pixel Tablet, Large Desktop'ta geçti; large tablet UI dump `Schedule Board`, `Mac-style planning lanes`, `Waiting Customer`, `In Production`, `Ready to Ship`, `Late Orders`, gerçek order kartları ve genişletilmiş status filter menüsünü gösterdi; üç cihaz AndroidRuntime logcat temiz. QA sırasında canlı schedule/order tarihleri değiştirilmedi.
	   - 2026-05-10 Android Schedule move/resize parity pass: Schedule tablet/desktop board ve takvim blokları Mac/Web ile aynı ortak order update yoluna bağlandı. Schedule kartları yatay sürüklenince siparişi gün bazında ileri/geri taşıyor; geniş board kartlarında `Earlier`, `Later`, `Shorter`, `Longer` kontrolleri var ve bunlar `details.paymentDate` / `details.deliveryTime` patch'lerini mevcut callable üzerinden gönderiyor. Kontroller Orders + Schedule workspace role erişimiyle sınırlı. Doğrulama: Android `:app:assembleDebug` ve `:app:installDebug` Pixel 8, Pixel Tablet, Large Desktop'ta geçti; large tablet UI dump `Schedule Board`, gerçek order kartları ve `Earlier`/`Later`/`Shorter`/`Longer` kontrollerini gösterdi; üç cihaz AndroidRuntime logcat temiz. QA sırasında canlı tarih/süre değiştiren kontrollere basılmadı.
	   - 2026-05-10 Android Plan & Access owner-testing parity pass: Mac/Web'deki geçici owner-only manuel plan switch paneli Android Settings > Plan & Access içine taşındı. Android artık mevcut plan erişim grid'i, ortak `Plan Matrix` ve owner-only `Owner testing controls` kartını gösteriyor. Owner plan butonları web ile aynı `companies/{workspaceId}` billing alanlarını yazar: `billingPlan`, `billingPlanName`, `billingPlanSource=manual_workspace`, storage/team limitleri ve timestamp. Non-owner kullanıcı owner kilit mesajını görür. Doğrulama: Android `:app:assembleDebug` ve `:app:installDebug` Pixel 8, Pixel Tablet, Large Desktop'ta geçti; Large Desktop UI dump `Available now`, `Plan Matrix` ve `Owner testing controls` metinlerini gösterdi; üç cihaz AndroidRuntime logcat temiz. QA sırasında canlı workspace planı değişmesin diye owner plan switch butonlarına basılmadı.
	   - 2026-05-11 Android Quick Reply runtime parity pass: Android Quick Reply ana ekranı artık Mac/Web ile aynı workspace ayarlarını okuyor/yazıyor: `replyMode`, `quickReplyPoliteness`, `quickReplyLength`, `openAIKey`, `aiKnowledgeBase`. Ton/uzunluk segmentleri ortak ayarlara kaydediliyor; Apple On-Device seçiliyse Android'de net uyarı gösteriliyor; Offline Template şirket bilgi tabanından lokal cevap üretiyor; OpenAI Online ortak API key ve bilgi tabanı prompt'u ile çalışacak şekilde bağlandı. Tablet ve Large Desktop'ta müşteri mesaj alanı ile Generated Reply paneli yan yana iki kolon; telefon akışı iPhone gibi dikey kaldı. Doğrulama: Android `:app:assembleDebug` ve `:app:installDebug` Pixel 8, Pixel Tablet, Large Desktop'ta geçti; Large Desktop UI dump `OpenAI Online`, `API key ready`, `Knowledge base ready`, `Politeness`, `Length`, `Customer's Email / Message`, `Generated Reply` metinlerini geniş iki panel düzeninde gösterdi; üç cihaz AndroidRuntime logcat temiz. QA sırasında canlı harici API çağrısı yapmamak için OpenAI generate butonuna basılmadı.
	   - 2026-05-11 Android Quick Reply template parity pass: Mac/Web `Offline Template` ayarlarındaki `Products / Services` ve `Custom Rules / FAQs` Android'e taşındı. Android model/repository artık `customProductsJSON` ve `customRulesJSON` alanlarını `QuickReplyTemplateItem` olarak okuyor; Settings > Quick Reply Settings içinde ürün/kural satırları eklenip silinip düzenlenebiliyor; telefon tek kolon, tablet/desktop iki kolon düzen kullanıyor. Offline Template ve OpenAI prompt'u bu products/rules listesini bilgi tabanıyla beraber kullanıyor. OpenAI API key alanı Android Settings'te maskelendi. Doğrulama: Android `:app:assembleDebug` ve `:app:installDebug` Pixel 8, Pixel Tablet, Large Desktop'ta geçti; Large Desktop Quick Reply Settings açıldı, üç cihaz AndroidRuntime logcat temiz.
	   - 2026-05-11 Android Account security parity pass: Android'deki `Require Face ID / device passcode on app launch` tercihi zaten cihazda kalıcı saklanıyordu; artık uygulama foreground'dan çıkıp mevcut Firebase oturumuyla geri açılınca Mac/iPhone beklentisi gibi tekrar `Unlock StudioFlow` ekranına düşüyor. Settings > Account > Security kartına `Device unlock is active/off` durum paneli, per-device açıklaması ve telefon/tablet/desktop'a uyumlu password reset / sign out buton düzeni eklendi. Doğrulama: Android `:app:assembleDebug` ve `:app:installDebug` Pixel 8, Pixel Tablet, Large Desktop'ta geçti; Large Desktop UI dump `Device unlock is active`, `Require Face ID / device passcode on app launch` ve Home'a gidip geri açınca `Unlock StudioFlow` ekranını doğruladı; üç cihaz AndroidRuntime logcat temiz. QA sırasında canlı hesap/oturum değişmesin diye password reset ve sign out butonlarına basılmadı.
	   - 2026-05-11 Android Orders filter/search parity pass: Orders listesi telefon/tablet/desktop'ta Mac'e daha yakın filtre/sıralama davranışı kazandı. Android artık workspace+user bazlı local preference ile arama metni, seçili filtre ve sort modunu saklıyor; arama customer/design/watchRef yanında assignee adı, contact alanları, status/design status, priority/risk, tracking/courier, notes, communication, extra statuses ve custom fields içinde de çalışıyor. Filtre menüsü `Assigned to me`, `Unassigned`, `Waiting Customer`, `In Production`, `Ready to Ship`, `High Priority`, `Completed`, `Cancelled` gibi Mac-style kategorilere genişledi; sort menüsü `Smart`, `Delivery due`, `Recent`, `Customer`, `Order value` seçeneklerini içeriyor. Doğrulama: Android `:app:assembleDebug` ve `:app:installDebug` Pixel 8, Pixel Tablet, Large Desktop'ta geçti; Large Desktop UI dump geniş `Order Filters` menüsünü, sayıları ve `All • Delivery due` seçili state'ini gösterdi; üç cihaz AndroidRuntime/System.err logcat temiz.
	   - 2026-05-11 Android Workflow custom fields parity pass: Mac/Web `customFieldsJSON` Android'e bağlandı. Settings > Workflow Steps içinde `Custom Fields` editörü var; Smart Customize ve standard template artık sadece status/step/toggle değil, sektör tipine göre customer/order custom field listesini de yazıyor. Order detail `Customer & Communication` kartı telefon/tablet/desktop'ta bu alanları gösteriyor; edit yetkisi varsa aynı karttan değerleri düzenleyip `updateWebOrder` içindeki shared `customFields` patch yoluna gönderiyor. Android backup/export/import order `customFields`, `customToggles` ve workflow field ayarlarını koruyor. Doğrulama: `:app:assembleDebug` geçti; `:app:installDebug` Pixel 8, Pixel Tablet, Large Desktop'a kuruldu; üç cihaz launch logcat'te AndroidRuntime/StudioFlow hatası yok. Canlı sipariş verisi değişmesin diye QA sırasında field save butonuna basılmadı.
	   - 2026-05-11 Android Materials & Inventory parity pass: Mac/Web material heading sistemi Android'e taşındı. Android artık `materialsDefaultChecksJSON`, `materialsTogglesJSON`, `invLabel1-4`, `showMaterialsNotesSupplier` ve `materialsNotesSupplierLabel` alanlarını okuyor/yazıyor. Settings > Workflow Steps içinde default material check başlıkları, ekstra Yes/No material check'leri ve Notes/Supplier label düzenlenebiliyor. Phone/tablet/desktop Materials kartları artık `Inventory 1/2/3/4` yerine workspace başlıklarını gösteriyor; ilk dört check `invBool1-4`, ek default check'ler `materialsDefaultToggles`, ekstra check'ler `materialsToggles` üzerinden `updateWebOrder` ile Mac/Web ile aynı yola yazılıyor. Smart/standard workflow template sektör bazlı material label da set ediyor. Backup/export/import artık `invBool1-4`, `invNotes`, `customFields`, `customToggles` ve material heading ayarlarını koruyor. Doğrulama: `:app:assembleDebug` geçti; `:app:installDebug` Pixel 8, Pixel Tablet, Large Desktop'a kuruldu; üç cihaz launch logcat'te AndroidRuntime/StudioFlow hatası yok. Canlı order değişmesin diye material toggle/save QA sırasında basılmadı.
	   - 2026-05-11 Android Notes/Schedule/Communication parity pass: Mac/Web order card heading detayları Android'e taşınmaya devam etti. Android model/repository artık `specialNoteSectionsJSON`, `scheduleQuickRemindersJSON`, `communicationShowTelephone`, `communicationShowEmail`, `communicationShowAddress`, `communicationShowChannel`, `communicationShowCustomerNotes` ve `communicationChannelLabelsJSON` ayarlarını okuyor. Settings > Workflow Steps içinde Special Note Sections, Quick Reminder Templates, Communication Fields ve Channel Button Names düzenlenebiliyor. Notes kartı phone/tablet/desktop'ta tüm configured special note bölümlerini gösteriyor; primary bölüm `details.notes`, ekstra bölümler `details.specialNotes` üzerinden Mac/Web'in `customFields.specialNote::<ID>` formatına gidiyor. Schedule & Alerts seçilen quick reminder template'in gün/saat/priority/notify değerlerini karta basıyor. Customer & Communication artık görünür iletişim alanları ve channel button isimlerini workspace ayarından alıyor, custom channel değerlerini `communicationChannel::<label>` ile shared update path'e gönderiyor. Doğrulama: `:app:assembleDebug` geçti; APK Pixel 8, Pixel Tablet, Large Desktop'a kuruldu/açıldı; üç cihaz AndroidRuntime/StudioFlow logcat temiz. Canlı workspace/order verisi değişmesin diye save/toggle kontrollerine QA sırasında basılmadı.
	   - 2026-05-11 Android Production Status + Financial Info parity pass: Production Status kartı artık workspace `customStepsJSON` ilk iki label'ını Design/Painting olarak, ekstra step'leri `extraStatuses`, custom yes/no toggle'ları `customToggles`, opsiyonel notes/supplier alanını `customFields.status::notesSupplier` olarak gösterip kaydediyor. Settings > Workflow Steps içine `Show Status Notes / Supplier` ve label editörü eklendi. Financial Settings içine Mac/Web heading detayları eklendi: `financialShowBaseCost`, `financialBaseCostLabel`, `financialRemainingItemsJSON`, `financialExpenseItemsJSON`. Android Financial Info kartı telefon/tablet/desktop'ta custom Pending/Remaining ve Cost satırlarını gösteriyor; edit yetkisi varsa `finance.financialRemainingValues` ve `finance.financialExpenseValues` map'leriyle Mac uyumlu `financialRemaining::<title>` / `financialExpense::<title>` custom field formatına kaydediyor. Backend `updateWebOrder` aynı yeni finance map'lerini kabul edecek şekilde güncellendi ve deploy edildi; `Full Payment` custom Pending satırlarını sıfırlarken onların tutarını Paid'e ekleyerek Mac davranışını takip ediyor. Doğrulama: `node --check functions/index.js` geçti; `firebase deploy --only functions:updateWebOrder` başarılı; Android `:app:assembleDebug` geçti; APK Pixel 8, Pixel Tablet, Large Desktop'a kuruldu/açıldı; üç cihaz AndroidRuntime/StudioFlow logcat temiz. Canlı finance/status verileri değişmesin diye QA sırasında save/full payment/toggle aksiyonlarına basılmadı.
	   - 2026-05-11 Android Order Summary / Priority / PDF Export parity pass: Order Summary kartı artık Mac/Web gibi workspace `summaryStep1` / `summaryStep2` ayarlarını ve `customSteps` label'larını kullanıyor; hardcoded Design/Painting özeti yerine seçili summary step değerlerini gösteriyor. Priority / Risk kartı kendi içinde editlenebilir hale geldi; risk değerleri backend `updateWebOrder` ile uyumlu `None`, `Waiting`, `Blocked`, `Overdue` listesine çekildi ve Workflow Controls da aynı listeyi kullanıyor. Telefon, tablet ve desktop order detail içine native `Export PDF` eklendi: telefonda detay üst barında `PDF`, geniş ekranda header `Actions > Export PDF`. PDF, Settings > PDF Export Settings toggle'larını, company invoice numbers alanlarını, customer/contact/preview/materials/priority/financial/payment/internal/status/shipping bölümlerini ve workspace currency/decimal ayarını okuyor; Android FileProvider ile cache'teki PDF'i sistem share sheet'e veriyor. Doğrulama: Android `:app:assembleDebug` geçti; APK Pixel 8, Pixel Tablet, Large Desktop'a kuruldu/açıldı; üç cihaz AndroidRuntime/StudioFlow logcat temiz. Canlı sipariş değişmesin diye Priority/Risk save ve Full Payment QA sırasında basılmadı; PDF action build/manifest/share-provider seviyesinde doğrulandı.

## 2026-05-14 kısa devam özeti

Bu bölüm başka MacBook/Codex başlığında hızlı devam için en güncel kısa özettir.

### En son çözülen kritik konu: Mac giriş donması

- Mac uygulaması girişten hemen sonra donuyordu.
- Donma hem bilgisayar şifresiyle Local Unlock yapılınca hem de Sign Out sonrası eski hesapla mail/şifre girişinde oluyordu.
- Kullanıcının gözlemi doğru çıktı: sorun sipariş kartı açılınca değil, giriş/auth geçişinde tetikleniyordu.
- Muhtemel kök sebep: Google ile giriş desteği eklenirken auth state değişimi, Local Unlock ve workspace/Firebase listener başlangıcı aynı anda/erken çalışmaya başlamıştı.
- Düzeltme:
  - `EGGcraft/AuthViewModel.swift`
    - `isWorkspaceReady` eklendi.
    - Kullanıcı Firebase Auth ile doğrulansa bile `currentCompanyId` workspace çözülene kadar hazır sayılmıyor.
    - Kullanıcı değişince `currentCompanyId = nil`, `isWorkspaceReady = false` yapılıyor.
    - `activateCompany(...)` sonunda workspace hazır hale getiriliyor.
  - `EGGcraft/EGGcraftApp.swift`
    - Local Unlock sonrası direkt `ContentView` açmak yerine workspace hazır değilse `WorkspaceLoadingView` gösteriliyor.
    - `syncFirebaseWorkspace()` artık sadece `isLoggedIn + isLocalUnlockSatisfied + isWorkspaceReady + currentCompanyId` olduğunda FirebaseManager listener başlatıyor.
  - `EGGcraft/ContentView.swift`
    - Mac’te ilk siparişi otomatik seçip detay ekranını açma davranışı kapatıldı; bu ana sebep değil ama eski hesaplarda ilk render yükünü azaltan ek koruma.
- Doğrulama:
  - macOS Debug build geçti: `BUILD SUCCEEDED`.
  - Debug app kısa süre çalıştırıldı, CPU 0.0 kaldı; önceki 100% CPU donma döngüsü görünmedi.
  - Kullanıcı “tamam olayı çözdün” dedi.

### NivaDesk marka geçişi

- Uygulama adı artık NivaDesk olarak ilerliyor.
- EGGcraft sadece arka şirket/alt açıklama bağlamında kalacak; ürün UI içinde ana marka NivaDesk olmalı.
- Plan adları NivaDesk Lite / NivaDesk Pro / NivaDesk Team olarak güncelleniyor.
- URL hedefi `nivadesk.co`.
- Logo kaynakları kullanıcı tarafından `/Volumes/Studio_4TB/NivaDesk/final2.png`, `final3 copy.png`, `final4.png`, `final4png` gibi dosyalarla verildi.
- Xcode asset tarafında NivaDesk logo/app icon çalışmaları başladı:
  - `EGGcraft/Assets.xcassets/NivaDeskLogo.imageset/`
  - `EGGcraft/Assets.xcassets/NivaDeskWorkspaceIcon.imageset/`
  - AppIcon PNG’leri değişmiş durumda.
- Header davranışı:
  - Sol üstte varsayılan marka olarak NivaDesk logo/lockup görünmeli.
  - Kullanıcı Settings > Account > Workspace Logo bölümünden kendi logosunu yüklerse header’daki logo onun yüklediği logo olmalı.
  - Logo kaldırılırsa tekrar varsayılan NivaDesk logosuna dönmeli.
  - Bu davranış Mac, web, Android tablet/desktop/phone için aynı olmalı.

### Google giriş / hesap sistemi

- Web’de Google ile hesap oluşturma/giriş var.
- Apple ürünlerinde de Google ile giriş desteklenmeli; Google ile kayıt olan kullanıcı şifre bilmeden aynı Google hesabıyla girebilmeli.
- Mac tarafında Google Sign-In için `AuthViewModel.signInWithGoogle()` içinde `currentKeyWindow()` ile macOS presenting window desteği eklendi.
- `EGGcraftApp.swift` içindeki `.onOpenURL` GoogleSignIn handle’ı artık sadece iOS ile sınırlı değil.
- Android tarafında kullanıcı “Google ile devam et” deyince `no credentials available` hatası almıştı. Bu konu hâlâ ayrıca kontrol edilmeli:
  - Firebase Android OAuth client / SHA-1 / SHA-256
  - Android Google Identity Services credential ayarları
  - `google-services.json`
  - package name `uk.co.eggcraft.studioflow`

### Son platform çalışma yönü

- Kullanıcı Android tarafında Mac/Web’deki tüm detayların phone/tablet/large desktop’a taşınmasını istiyor.
- Android order detail board tarafında büyük ilerleme var:
  - Tablet/desktop Mac-style çok kolonlu board.
  - Kart sürükleme, kolonlara taşıma, genişlik/yükseklik senkronu büyük ölçüde çalışıyor.
  - Alt resize çubuğu çalışıyor ama geçmişte hız/ölçek/senkron hassasiyetleri düzeltilmişti; tekrar dokunurken Mac/Web davranışıyla karşılaştır.
  - Kart minimum yüksekliği: Android kartlar içerik kaybolacak kadar küçülmemeli; Mac/Web minimum content height mantığına uyumlu olmalı.
- Web tarafında son açık/istenenlerden bazıları:
  - Order Filters menüsü Mac gibi tek kapalı buton halinde olmalı; Smart/Recent ve All seçimi menü açılınca görünmeli.
  - Kart alt resize çizgilerinin web’de görünürlüğü kontrol edilmeli.
  - Profil avatarı yoksa sağ üstte profil initials gösterilmeli.
  - Sağ üst profil menüsünde Account ve Sign Out olmalı.
- Mac tarafında son kritik auth donması çözüldü; tekrar giriş/logout testlerinde önce bu akış korunmalı.

### Yeni Codex başlığında ilk yapılacaklar

1. Önce `PROJECT_CONTEXT.md`, `CHANGELOG_STUDIOFLOW.md`, `CODEX_CONTINUE_TURKISH.md` oku.
2. `git status --short` ile kirli dosyaları gör; kullanıcı değişikliklerini geri alma.
3. Mac giriş/auth tarafına dokunursan `isWorkspaceReady` sırasını bozma.
4. Platform parity işlerinde önce Mac/Web mevcut davranışını araştır, sonra Android/Web/Mac’e küçük patch uygula.
5. Raporlarken mutlaka “neyi kontrol edeceğim” maddeleri yaz.

## Cevap formatı

Her işten sonra kısa raporla:

1. Değişen dosyalar
2. Ne değişti
3. Build/deploy adımları
4. Manuel testler

En önemli genel kural: app'te var olan davranışı önce incele, sonra web'e taşı. Role/plan/card profile/Firebase path tarafına dokunan her değişiklikte Swift app, web ve Functions etkisini birlikte kontrol et.
