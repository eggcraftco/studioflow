# NivaDesk — Dış Göz Denetim Raporu (Web · Mac/iPhone/iPad · Android · Sunucu)

Tarih: 2 Eylül 2026 (gece). Yöntem: (1) web uygulaması emülatörde üç hesapla gerçek kullanıcı gibi gezildi ve tıklandı; (2) dört platformun kaynak kodu ve Cloud Functions + Firestore/Storage kuralları beş ayrı salt-okunur denetimle tarandı (web, sunucu/kurallar, iOS/macOS, Android, platformlar-arası tutarlılık). Hiçbir dosya değiştirilmedi, hiçbir şey deploy edilmedi, üretime hiç yazılmadı.

Nasıl okunmalı: Her madde bir **kontrol sorusu**dur, kesin hüküm değil. Kod satırı verilen maddeler koddan okunarak yazıldı; "verify:" ile işaretlenenler daha belirsiz. Öncelikler: **[Kritik]** = para yanlış / veri kaybı / kullanıcı kilitlenir / çökme · **[Yüksek]** = özellik kullanılamıyor ya da yanıltıyor · **[Orta]** = sürtünme · **[Düşük]** = cila.

Toplam madde: Elle test 43 · Web kod 80 · Sunucu/Kurallar 54 · iOS/macOS 62 · Android 52 · Platform tutarlılığı 53.

---

## 0) ÖNCE BUNLARA BAKIN — 25 başlık (kaynak bölümleri parantezde)

**Para, veri kaybı, kilitlenme**

1. Mac/iPhone Pro/Team'de sipariş ve müşteri kayıtları **merge'siz tam doküman** olarak yazılıyor; siparişi sadece **açıp kapatmak** bile yazım yapıyor → sunucunun/entegrasyonların yazdığı alanlar (`commerce`, `etsySource`, `createdAt`, portal token, onarım tipi, iade/`refundedAmount` dışındaki damgalar…) siliniyor; çevrimdışı kuyruk aynı tam yazımı sonradan tekrar oynatıyor. (iOS #1-#9, #13; Parite #1-#3, #9, #19; Sunucu #24)
2. **Ekip üyesi web'de tamamen kilitleniyor**: `memberAccess` kaydında `assignedProjectsOnly` yoksa Firestore kuralı hata fırlatıyor, Home/Orders/Dashboard/Customers/Settings ham kural metniyle çöküyor; kayıt düzeltilse bile /orders başka kullanıcının `users/{uid}` belgesini okumaya çalışıp yine düşüyor. (Elle #17-#18)
3. **Virgüllü ondalık**: web para alanı `1,5` → £15 (10 kat), Android `12,50` → 1250 (100 kat), Mac virgülü siliyor; envanter satın almada da aynı. (Elle #1; Web #34; Android #1; iOS #15)
4. Ödenen tutar toplamı aşınca **sipariş değeri sessizce büyüyor**, geçmişe yazılmıyor; ödeme defteri ile "Paid" tutmuyor; ödeme yöntemi seçilmeden "Card" kaydediliyor; platform ücreti ayarlanmadan **%3** düşülüyor. (Elle #2-#6; Web #4-#5)
5. Aynı sipariş için **kâr ve KDV dört platformda farklı** hesaplanıyor (özel "Remaining" toplama kuralı, marj rejiminde matrah, negatif tutarların 0'a kırpılması, yuvarlama); aynı ekranda "Month Margin" ile "Final Profit" iki farklı sayı. (Parite #4-#7, #23; Elle #7)
6. **Zamanlanmış hatırlatmalar yalnız `test_studio_123` için çalışıyor**; iOS'ta aynı alarm iki kez bildirim üretebiliyor; Android'de not hatırlatıcısı hiç uyarmıyor. (Sunucu #2; iOS #14; Android #12)
7. Güvenlik: kullanıcı kendi `users/{uid}/workspaceAccess/{cid}` belgesini yazıp **başka çalışma alanının dosyalarına** erişebiliyor; `paypalPayouts/squarePayouts` ve `companySettings` (SMS/finans alanları) üyeler tarafından doğrudan yazılabiliyor; `mergeOrders` rol kontrolü yapmıyor. (Sunucu #1, #3, #4, #7)
8. **Ödeme rayları**: Android'de plan yükseltme ikinci Play aboneliği açıyor ve bekleyen satın alma sessizce atılıyor; iOS `transaction.finish()` sunucu doğrulamasından önce, pending onay düşmüyor; Stripe checkout açılınca deneme hakkı "kullanıldı" sayılıyor; hesap silme Play aboneliğini iptal etmiyor. (Android #2-#3, #21; iOS #31; Sunucu #11)
9. **Giriş ekranında "şifremi unuttum" yok** — web, iOS/macOS ve Android'de; şifresini unutan kullanıcı giremiyor. (Web #1; iOS #34; Android #7)
10. Müşteri silme **kaskadı**: müşterinin tüm siparişleri "New Project" oluyor, iletişim bilgileri siliniyor; Mac'te onaysız ve kalıcı; aynı isimli ikinci müşteri de etkileniyor; web'de müşteri formu boş kaydedilip "New Project" adlı müşteri yaratıyor ve boş siparişle eşleşiyor. (Sunucu #6; iOS #10-#11; Elle #13)
11. Android kararlılık: sipariş dinleyicisi bir hata alınca liste boşalıp ölüyor; beklenmeyen alan tipi her açılışta çökertiyor; uygulama kilidi biyometrik hiç çalışmıyor; döndürmede taslaklar siliniyor; geri tuşu alt sayfadan uygulamayı kapatıyor gibi davranıyor. (Android #4-#6, #8-#9)
12. Web veri kaybı: envanter fotoğraf modalı ürünün diğer alanlarını siliyor/stoku sıfırlıyor; KDV milestone tarihi her kayıtta bir gün geri kayıyor; ödeme satırı silme onaysız. (Web #2-#4)
13. Plan yaşam döngüsü: Mac/Android'den kayıt olan **14 günlük denemeyi hiç almıyor**; deneme bitince native ücretli arayüzde kalıyor; Storage kuralları biten denemeyi Pro sayıyor; hesap silme birçok koleksiyonu bırakıyor; üyelikten çıkarılanın `activeCompanyId` sıfırlanmıyor. (Sunucu #8-#10, #17; Parite #15)
14. Onboarding'de seçilen **para birimi/ülke/saat dilimi hiçbir yerde uygulanmıyor** (ISO kod yazılıyor, sembol okunuyor). (Parite #8)
15. E-posta değiştirince hesap doğrulanmamış oluyor + 10 gün soğuma → yazım hatasında kilitlenme; doğrulanmamış hesap temizliği envanter/not/banka kullananları da silebilir. (Sunucu #12, #27)

**Kullanıcı deneyimi (yüksek)**

16. "+ Add Project" hiç sormadan "New Project / Untitled design" boş sipariş açıyor; yanlış tık = çöp kayıt; bu sırada tam ekran "Loading your workspace…" kartı çıkıyor. (Elle #12)
17. **Ham Firebase/Play/callable hata metinleri** dört platformda da kullanıcıya gösteriliyor; sunucu mesajları yalnız İngilizce, istemciler hata kodlarını eşlemiyor. (Web #36; iOS #35; Android #13; Sunucu #32)
18. Mobil web: sipariş listesinde müşteri adı 3 harf, ilk saniyeler "0 orders", derin link detayı açmıyor; silme/iptal/atama/birleştirme mobilde hiç yok. (Elle #26; Web #21)
19. Koyu tema: müşteri formunun girdi kutuları görünmüyor; Messages başlıkları okunmuyor; Android'de sabit renkler. (Elle #14, #27; Android #48)
20. Üye varsayılan olarak sahibin **kâr/marj rakamlarını görüyor**; düz üye "Workflow Only" etiketiyle gösteriliyor; iki farklı "Getting started" listesi farklı sayı veriyor. (Elle #19-#20, #28)
21. Yerelleştirme: İngilizce arayüzde "BOYA" kısaltması; portal, teklif onayı ve PDF'ler her dilde İngilizce; bildirim merkezi, Messages, kilit ekranı vb. sabit İngilizce; Mac sözlüğü web çevirilerini eziyor; Android durumları çevrili ham değer olarak kaydediyor. (Elle #25; Web #15-#16, #23, #43-#47; iOS #43-#46; Android #22; Parite #11, #20, #40-#41)
22. Onaysız yıkıcı işlemler (mesaj "delete for everyone", not "Delete forever", ekip üyesi çıkarma, banka kuralı silme, Home "Reset layout"…). (Web #35; Android #15; iOS #10)
23. Bildirimler: macOS hiç push almıyor; çalışma alanı değişince eski token kalıyor; Android tek kanal + sistem ikonu; push'a dokunmak siparişe gitmiyor; izin bağlamsız isteniyor. (iOS #24, #39; Parite #17, #38; Android #16-#17; Web #25)
24. Ekip daveti ters: sahip kimseyi davet edemiyor, üye istek göndermek zorunda; Android'de davet hiç yok; yeni üye kişisel "My Studio" hayalet alanı alıyor ve iki alan da "My Studio" adında. (Elle #22, #24; Web #51)
25. macOS pencere en az 1550 pt istiyor → 13" MacBook'a sığmıyor; iPhone/iPad'de kart düzeni düzenlenemiyor; QuickBooks/Xero/banka bağlama native'de yok. (iOS #23, #26, #28; Parite matrisi)

---

# 1) ELLE TEST — Web uygulaması, emülatörde gerçek kullanıcı gibi gezildi

Ortam: `localhost:3000` (dev sunucusu, `NEXT_PUBLIC_FIREBASE_EMULATOR=1`), Firebase emülatörleri (auth 9099 / firestore 8080 / functions 5001). Tarayıcıdan ağ istekleri doğrulandı: yalnız `127.0.0.1:9099` ve `127.0.0.1:8080`, üretime hiç istek gitmedi. Üç hesapla gezildi: `review@nivadesk.app` (Team planı, owner), `member@nivadesk.app` (üye), taze kayıt (`disgoz.test@example.com`). Repo'da hiçbir dosya değiştirilmedi; yalnız emülatör verisi kullanıldı.

Her madde: **[Öncelik] Başlık** · yaşadığım şey · kanıt · kontrol edilecek soru.

## Para ve sipariş formu

1. **[Kritik] Para alanına virgülle ondalık girince tutar 10 kat büyüyor.** "Paid" alanına `1,5` yazdım → **£15.00** kaydedildi (alan `type="number"`, tarayıcı virgülü atıyor; `parseFinanceNumber` virgülü ondalık sayıyor ama oraya hiç ulaşmıyor). Kanıt: `studioflow-web/app/orders/OrderDetailContent.tsx:1616-1626`, `:10610`. Soru: Türk/Alman klavyeli kullanıcı "12,50" yazınca ne kaydediliyor? (Android'de aynı bug 100 kat: bkz. Android #1; Envanter satın alma: web #34.)
2. **[Kritik] "Paid" alanını tekrar tıklayıp yazınca eski değerin üstüne EKLENİYOR.** İkinci düzenlemede `150` yazdım → alan `15150` oldu (imleç sona geliyor, metin seçili gelmiyor) → sipariş değeri **£15,150** oldu. Kanıt: aynı `FinanceInlineRow`, `OrderDetailContent.tsx:10600-10650` (odaklanınca select-all yok). Soru: "Click to edit" alanları açılınca içerik seçili gelmeli mi?
3. **[Kritik] Ödenen tutar toplamı aşınca sunucu sessizce sipariş DEĞERİNİ yükseltiyor.** Remaining £100 girmiştim; Paid 15.150 olunca Remaining £0'a düştü, Order Value 15.150'ye çıktı; uyarı yok; History'de bu değişim için satır YOK (yalnız "Remaining set £100" ve "Payment received £15"). Kanıt: `functions/index.js` updateWebOrder `nextPaidAmount = Math.min(..., nextOrderValue)` (~15340-15352). Soru: paid > order value durumunda hata mı verilmeli, geçmişe yazılmalı mı?
4. **[Yüksek] Ödeme defteri (payments) ile Paid toplamı tutmuyor.** İlk Paid düzenlemesi "£15 · Card" diye bir ödeme satırı yarattı; ikinci düzenleme (15.150) yaratmadı → Paid £15.150, defterde tek satır £15. Kanıt: `functions/index.js:12221` ("Payment #1" yalnız ilk girişte), `:12028`. Soru: Paid alanı ile ödeme defteri hangisi "gerçek"? Muhasebe/CSV hangisini alıyor?
5. **[Yüksek] Ödeme yöntemi kimse seçmeden "Card" olarak kaydediliyor.** Yeni siparişin dokümanında `paymentMethod: "Card"`; nakit çalışan bir atölyede raporlar yanlış olur. Kanıt: `OrderDetailContent.tsx:6895` (`order.paymentMethod || "Card"`), `:11127`. Soru: varsayılan boş ("-") olmalı mı?
6. **[Yüksek] Platform ücreti hiç ayarlanmadan %3 düşülüyor.** Seed'de ücret 0 iken Paid 15 → "Platform Fee £0.45", 15.150 → £454.50; Final Profit buna göre. Kanıt: `OrderDetailContent.tsx:3895` (`feePercentage ?? 3`), `lib/studioflow/firestore.ts:1212`, `functions/index.js:8432, 8680, 14390`. Soru: Free/nakit kullanıcı için varsayılan %3 doğru mu? Onboarding bunu soruyor mu?
7. **[Yüksek] Aynı ekranda iki farklı "kâr".** Üst çubuk "Month Margin £14.695,50" (KDV düşülmemiş), kartta "Final Profit £12.170,50" (KDV düşülmüş); Dashboard "Net Profit" üçüncü isim. Kanıt: `lib/studioflow/finance.ts:18-22` (bilinçli "NOT net profit"), `AppShell.tsx:1557-1565`. Soru: kullanıcıya hangisinin ne olduğu nerede anlatılıyor?
8. **[Yüksek] Üst çubuktaki marj sipariş düzenlenince canlı güncellenmiyor.** Paid 15.150 kaydedildikten sonra çubuk £0,00 kaldı; sayfa değişince £14.695,50 oldu. Kanıt: `AppShell.tsx:1563-1580` (financeOrders memo). Soru: marj hesabı snapshot'a bağlı mı, sayfa geçişine mi?
9. **[Yüksek] Negatif tutar sessizce 0 oluyor, satır içi alan Enter'la kaydolmuyor.** `-50` + Enter → alan açık kaldı; Tab'la çıkınca 0 yazıldı, uyarı yok. Kanıt: `OrderDetailContent.tsx:1617,1625` (`Math.max(0, …)`), `:10647` (yalnız `onBlur`, `onKeyDown` yok). Soru: Enter kaydetmeli mi; negatif girişte mesaj verilmeli mi?
10. **[Orta] Sıfır tutarlar kırmızı yazıyor.** Cost (Base) £0.00, Platform Fee £0.00, Shipping £0.00 kırmızı; kullanıcı "hata var" sanır. Soru: kırmızı yalnız negatif/eksik için mi olmalı?
11. **[Orta] Dashboard/rapor dönemi "Created Date" ile ayrılıyor, ödeme tarihiyle değil.** Alan adı `paymentDate` ama UI'da "Created Date"; 3 ay sonra alınan ödeme siparişin açıldığı aya sayılıyor. Kanıt: `app/dashboard/page.tsx:362-458` (hep `paymentDate`), `OrderDetailContent.tsx:6499, 6552`. Soru: muhasebe için "ödeme alındı" tarihi ayrı tutulmalı mı; kullanıcı "Created Date"i değiştirince finans raporu da kaydığını biliyor mu?

## Sipariş oluşturma ve müşteri

12. **[Yüksek] "+ Add Project" hiç sormadan boş sipariş açıyor.** Tek tık → "New Project / Untitled design / 45 gün" kaydı; yanlış tıklama = çöp kayıt (Free'de 10 sipariş limitine sayılır). Bu sırada tam ekran "Loading your workspace… Checking your account access." kartı çıkıyor (sipariş yaratmayla ilgisi yok, korkutucu). Kanıt: `components/AppShell.tsx:2254-2259`, `functions/index.js:14372` (varsayılan "New Project"). Soru: önce mini form (müşteri adı + iş adı) mı, yoksa "Undo" toast'u mu?
13. **[Yüksek] Müşteri formu boş kaydedilebiliyor ve "New Project" adlı müşteri yaratıyor.** "+ Customer" → hiçbir alanı doldurmadan Save → "Customer created." → adı "New Project" olan müşteri; adı "New Project" olan boş siparişle otomatik eşleşti (£15.150 total value görünüyor). Kanıt: `app/customers/page.tsx:100` (fallback "New Project"), `:598`; sunucuda `createWebCustomer` ad zorunluluğu yok (`functions/index.js` createWebCustomer). Soru: ad zorunlu olmalı mı; "New Project" placeholder'ı eşleştirmeden hariç tutulmalı mı?
14. **[Yüksek] Koyu temada müşteri formunun girdi kutuları görünmüyor.** Beyaz modal + görünmez alanlar; yalnız etiketler var. Kanıt: `app/customers/page.tsx:1879` (`add-order-modal`, `.input`), `app/globals.css:80` (dark `.input` rengi var, `.add-order-modal` için dark kuralı yok, `:3020-3026` sabit beyaz). Soru: tüm modallar koyu temada test edildi mi?
15. **[Orta] Yeni müşteri formunda "Phone (from orders)" alanı var.** Yeni müşteri için anlamsız; "These fields match the NivaDesk app customer profile." cümlesi geliştirici notu gibi. Kanıt: `app/customers/page.tsx:1878-1960`. Soru: yeni-kayıt formunda gizlenmeli mi?
16. **[Orta] Siparişten müşteri kaydı oluşmuyor gibi görünüyor.** Seed siparişinin müşterisi "QA Team Test Customer" Customers'ta 0; Home "Customers: Nothing here yet". (Sunucu `createWebOrder` müşteri yaratıyor, seed atlamış olabilir.) Soru: siparişteki müşteri adı değişince müşteri kaydı da güncelleniyor mu / kopya mı oluşuyor? (iOS'ta yeniden adlandırma bug'ı: iOS #11.)

## Ekip üyesi deneyimi (member rolü)

17. **[Kritik] `memberAccess` kaydında `assignedProjectsOnly` yoksa üye HER şeyi kaybediyor.** Üye hesabında Home/Orders/Dashboard/Customers/Settings hepsi kırmızı ham hata: `evaluation error at L927:22 for 'list' @ L927 … Property assignedProjectsOnly is undefined on object`. Kanıt: `firestore.rules:70-71` (`memberAccess[uid].assignedProjectsOnly` korumasız), `:927`; `functions/index.js:2518` (yalnız sunucu yolu varsayılanı yazar). Sorular: (a) eski üyelerin/Mac-Android'den yazılan kayıtların hepsinde bu anahtar var mı (Firestore'da tara)? (b) rules'ta `'assignedProjectsOnly' in … ` koruması eklenmeli mi? (c) ham kural hatası kullanıcıya hiç gösterilmemeli mi?
18. **[Kritik] Üye, sipariş listesini açamıyor: "false for 'get' @ L406".** Kayıt düzeltildikten sonra bile /orders "Could not load orders" (başka bir kullanıcının `users/{uid}` belgesi okunmaya çalışılıyor). Home aynı siparişleri gösterebiliyor. Kanıt: `firestore.rules:406` (`users/{userId}` yalnız kendisi), `lib/studioflow/firestore.ts:933`. Soru: orders sayfası üye için hangi kullanıcı belgesini okuyor (owner profili? atanan kişi?)
19. **[Yüksek] Düz üye "Workflow Only" rozetiyle etiketleniyor.** Rol "Member" ama üst çubukta "Workflow Only" (roleLabel boşsa fallback). Kanıt: `components/AppShell.tsx:2047`. Soru: fallback rolü neden "Workflow Only"?
20. **[Yüksek] Üye, sahibin kâr rakamlarını görüyor.** Üst çubuk "Month Margin £14.695,50", Home "Net profit £12.170,50" düz üyede açık (memberAccess varsayılanları dashboard+financialInfo=true). Kanıt: `AppShell.tsx:1557-1561`, `functions/index.js:2500-2520` (varsayılanlar). Soru: yeni üye varsayılan olarak finansı görmeli mi?
21. **[Orta] Üyenin Settings menüsünde Branding/Financial/Team/Plan/Integrations/Data Management listeleniyor.** İçeri girince ne olduğu belirsiz. Soru: yetkisiz bölümler gizlenmeli mi, "salt okunur" mu?
22. **[Orta] Herkesin çalışma alanı "My Studio".** Üyenin Team sayfasında "Connected workspaces: My Studio (Owner) — Switch" + katıldığı alan da "My Studio"; hangisi hangisi belli değil. Kanıt: `lib/auth/AuthProvider.tsx:146-150` (hayalet "My Studio"), `functions/index.js` initializeFreeDemoWorkspace. Soru: kişisel varsayılan alan ad+e-posta ile ayrıştırılmalı mı?
23. **[Orta] Üyeye de "STEP 1/6 Start with Add Project" turu ve "Create your first order" kartı çıkıyor** (liste hata verince boş sanılıyor; alanda 2 sipariş var). Kanıt: `components/AppShell.tsx:1640-1660`, `app/orders/page.tsx` boş durum kartı. Soru: liste hatası ile "boş liste" ayrılmalı mı?
24. **[Orta] Davet akışı ters: sahip kimseyi davet edemiyor, üye "istek göndermek" zorunda.** Team sayfası: "Share your account email or Company ID with the person… They send a request, then you approve it." Soru: e-posta ile davet linki planlanıyor mu? (Android'de davet hiç yok: parite tablosu.)

## Genel arayüz, tutarlılık, ilk açılış

25. **[Yüksek] Sipariş kartındaki adım kısaltmaları İngilizce arayüzde Türkçe: "BOYA".** "Painting" adımı → "BOYA" (kod Türkçe eşleşme yapıyor); "DESI" da anlamsız. Kanıt: `components/OrderListCard.tsx:173-174`. Soru: adım kısaltması yerine ikon/tam ad?
26. **[Yüksek] Mobilde sipariş listesi kullanılamaz.** 375 px'te müşteri adı "QA …" / "Ne…" (3 harf), çipler yer kaplıyor; sayfa ilk 5-7 sn "0 orders" + boş alan gösteriyor (yükleme göstergesi yok); `?selectedOrderId=` derin linki mobilde detayı açmıyor. Kanıt: `app/orders/page.tsx:171, 232-264`, mobil CSS `globals.css:11718-11736`. Soru: mobil kart düzeni ayrı tasarlanmalı mı?
27. **[Yüksek] Koyu temada Messages başlıkları görünmüyor.** "Messages" ve "Team Chat" koyu zemin üstünde koyu yazı. Kanıt: `app/messages/page.tsx` (inline `color: "#1f2937"` vb. `:1269`), dark kuralı yok. Soru: tüm sayfalar koyu temada gözle tarandı mı?
28. **[Yüksek] İki farklı "Getting started" listesi.** Home 6 adım "2 of 6" (profil, müşteri, sipariş, mağaza, envanter, banka); Dashboard 5 adım "1/5" (sipariş, müşteri, ChatGPT içe aktarım, mağaza, domain). İkisi aynı anda görünüyor, sayılar tutmuyor. Kanıt: `components/home/HomeCardBodies.tsx:2165-2171`, `app/dashboard/page.tsx:84-88`. Soru: tek liste olmalı mı?
29. **[Orta] Sipariş kartı etiketleri açılışta önce varsayılan (saat tamirci) değerleri gösterip sonra değişiyor.** Yeni sipariş ilk anda "Dial Sourced / Dial Received / Watch Received" ve genel onarım alanları (Brand/Model/Colour), saniyeler sonra "Dial/Hands/Case" ve kuyumcu alanları. Kanıt: `OrderDetailContent.tsx:1345` (`APP_DEFAULT_MATERIAL_LABELS` saat-özel), `lib/studioflow/repairIntakePresets.ts:170-180`. Soru: ayarlar yüklenene kadar kart çizilmemeli mi; pastacı için "Dial Sourced" varsayılanı doğru mu?
30. **[Orta] Terminoloji karışık.** Menü "Orders", düğme "Add Project", Production'da "Add production order", Export'ta "invoices", varsayılan ad "New Project". Kanıt: `AppShell.tsx:103, 2254`, `app/production/ProductionContent.tsx`, `app/export/page.tsx`. Soru: ürün sözlüğü (Order/Project/Job) tek mi?
31. **[Orta] Tarih formatı aynı kartta iki türlü:** "25/08/26" ve "25 Aug 2026"; 2 haneli yıl ABD'li kullanıcıda ay/gün karışır. Kanıt: `OrderDetailContent.tsx:124-178` (en-GB sabit). Soru: uygulama diline/yerel ayara göre tek format?
32. **[Orta] Production'da sipariş numarası "#K5Nk41" gibi rastgele 6 karakter.** `watchRef` yoksa doküman id'sinin ilk 6 karakteri. Kanıt: `app/production/ProductionContent.tsx:597, 792`. Soru: gerçek sıra numarası (order number) var mı; yoksa gizlenmeli mi?
33. **[Orta] Production sütunlarında "0 / 10" ne demek anlaşılmıyor** (WIP limiti?). Soru: açıklama/tooltip?
34. **[Orta] Schedule sayfası bugünün haftasında değil, seçili siparişin haftasında açılıyor;** "1 days"/"6 days" dilbilgisi; sol takvim Eylül gösterirken sağ çizelge Ağustos. Kanıt: `app/schedule/page.tsx`. Soru: açılış görünümü "bugün" olmalı mı?
35. **[Orta] Geliştirici notları ve eski plan adı kullanıcıya görünüyor.** Plan sayfası: "These keys should stay shared between the app, web portal and Firebase plan guards.", "Server-side recalculation can be connected later.", "If a Lite, Pro or Team subscription expires…"; Export: "imported back into the Swift app"; Pricing sayfa başlığı hâlâ "Free, Lite, Pro & Team Plans"; AI Replies "sync across web, Mac, iPad and iPhone" (Android yok). Kanıt: `app/plan/page.tsx:350, 453, 369`, `app/export/page.tsx:144`, `app/pricing` metadata, `app/quick-reply/page.tsx`. Soru: metin taraması "Lite/Swift/legacy" için yapılmalı mı?
36. **[Orta] Plan sayfası ile plans.ts çelişiyor:** Plan sayfası Free'de "Card Customization 🔒", `plans.ts` Free'de `card_customization: true`; fiyat tablosu Free "Card customisation –". Kanıt: `app/plan/page.tsx` Free kartı, `lib/studioflow/plans.ts:57`. Soru: Free'de kart özelleştirme var mı yok mu?
37. **[Orta] Client Files kartı her tarayıcıda "upload policy" onayı istiyor** ("I understand and accept the upload policy for this browser"). Soru: bir kez kabul yeterli olmalı mı?
38. **[Orta] Sign Out `window.confirm` ile.** Tarayıcı diyaloğu; uygulama diline çevrilmiyor, mobil Safari'de çirkin. Kanıt: `app/settings/page.tsx:3994`. Soru: tüm `window.confirm`'ler uygulama modalına taşınmalı mı? (web #40 listesi.)
39. **[Orta] Kayıt formu hydration uyarısı veriyor** (`disabled`/`required` sunucu-istemci farkı) ve şartlar kutusu programatik doldurmada kaydı reddediyor ("Please accept the Terms…" — gerçek tıkla çalışıyor). Kanıt: `components/PublicMarketing.tsx:3440-3470`. Soru: form ilk render'da `disabled` olmalı mı?
40. **[Orta] Kayıt sonrası "Creating workspace…" 30+ sn takılı kaldı, hata gösterilmedi** (emülatörde; `updateProfile` veya callable yanıt vermeyince zaman aşımı/mesaj yok). Kanıt: `components/PublicMarketing.tsx:3496-3540` (timeout yok). Soru: 10 sn sonra "hâlâ çalışıyor / tekrar dene" mesajı?
41. **[Düşük] Giriş sayfasında logo soluk + "Dashboa▮" daktilo animasyonu** ilk saniyelerde bozuk görünüyor; giriş sayfasında şifre sıfırlama linki yok (web #1, iOS #34, Android #7 ile aynı). Soru: animasyon gerekli mi?
42. **[Düşük] Envanter kenar çubuğunun alt kısmı (Stocktake/Locations) sabit "N" yardım düğmesinin altında kalıyor;** Inventory kategorileri saat/kuyumcu (Watches, Dials, Movements) — diğer meslekler için varsayılan ne? Soru: kategoriler meslek seçimine göre mi geliyor?
43. **[Düşük] Console'da her sayfada bir "400 Bad Request"** (kaynağı bulunamadı; functions/auth istekleri 200). Soru: Network sekmesinde hangi istek 400 dönüyor?

## Emülatörde bıraktığım test verisi (temizlenebilir)

- `siparisler/K5Nk41boesZEstqcb4wh` (New Project, £15.150), `musteriler/Oz5ykoK7Tl8zFB68Y7VT` (New Project), auth kullanıcısı `disgoz.test@example.com` (uid `4SrpzDIeVrpVrH0Za8PQjlfyhG51`, hiç workspace'i oluşmadı), `companies/qa-workspace.memberAccess.qa-member-uid.assignedProjectsOnly=false` eklendi, QA kullanıcılarına emülatör şifresi verildi. Üretime hiçbir şey yazılmadı.


---

# 2) WEB — kod denetimi (Next.js)


Kapsam notu: Tüm yollar `studioflow-web/` köküne göredir (`functions/…` = repo kökündeki Cloud Functions). Her satır numarası kaynakta doğrulandı. Sipariş detayı, Ayarlar/entegrasyonlar, Banka/Dashboard/Export, Envanter/Dosyalar ve Home/Bildirim/i18n alanları için paralel inceleyici raporları alındı ve alıntılanan satırlar tek tek teyit edildi; Mesajlar/Notlar/Takvim/Müşteriler/Ekip/Üretim için ayrılan inceleyici rapor vermedi, bu alanlar doğrudan hedefli okumalarla (daha sığ) kapsandı.

### A) Özellik envanteri

| Rota | Ne yapar · ana aksiyonlar · plan kapısı |
|---|---|
| `/` `/features` `/pricing` `/faq` `/contact` `/changelog` `/chatgpt` `/custom-order-management` `/review-demo` + legal (`/privacy` `/terms` `/cookies` `/security` `/subprocessors` `/acceptable-use` `/account-deletion` `/data-processing-agreement` `/refund-cancellation`) | Public pazarlama/legal (`components/PublicMarketing.tsx`, `lib/publicSite/*`); kendi dil sağlayıcısı; kapı yok |
| `/guide` | Public kabuk içinde kullanım kılavuzu; içerik ücretli plana özel, sunucudan (`getUserGuide`) |
| `/login` | Google/Apple + e-posta girişi; `?next=` honor edilir; **şifre sıfırlama linki yok** |
| `/signup` | E-posta+şifre/OAuth kayıt, `initializeFreeDemoWorkspace`, honeypot; Google/Apple yolunda form atlanır |
| `/auth/action` | Markalı Firebase action handler (verify/reset/recover); tamamı İngilizce |
| `/home` | 11 kart / 3 boyut, sürükle-bırak yerleşim (kişisel, callable ile), hızlı aksiyonlar, kart başına durumlar; plan kapısı yok (yalnız üye erişimi) |
| `/orders` | Liste + sağ panel; arama/filtre/sıralama, çoklu seçim, sağ-tık menüsü (Bitti/İptal/Ata/Birleştir/Çöp), Çöp+geri yükle+kalıcı sil, bekletilen mağaza siparişleri; mobilde liste → `/orders/[id]` |
| `/orders/[orderId]` | Tek sipariş (mobil/derin link); `OrderDetailContent` 19 kart (finans, kalemler, ödeme defteri, tahmin/onay, portal, onarım kabul, üretim, stok, takvim, to-do, çalışma süresi, dosyalar, notlar, geçmiş, PDF'ler) |
| `/production` | Kanban; aşama saklanmaz, adımlardan hesaplanır; sürükle (dataTransfer var); `orders` erişimi |
| `/dashboard` | KPI/gelir/kâr/KDV, aralık (Custom/karşılaştırma Pro+), kanal filtresi, banka kartı (canlı), widget görünürlüğü; `dashboard`+`financialInfo` erişimi |
| `/bank` | Open Banking/PayPal akışı, 5 sekme (Overview/Transactions/Recurring/Receipts/Rules), çekmece (kategori/KDV/iade↔sipariş/bölme/fiş), Pandle; `bankFeed` erişimi; **plan kapısı yalnız menüde** |
| `/schedule` `/team-schedule` | Sipariş takvimi (hafta/ay), üye gruplu mod (aynı bileşen, pathname ile); `schedule` erişimi |
| `/notes` | Notlar, hatırlatıcılar, paylaşım, arşiv/çöp; `notes` erişimi menüde gizler, sayfada kontrol yok |
| `/customers` | Müşteri dizini/detay, birleştir, anonimleştir, sil; `?customerName=` derin link; `customers` erişimi; Free 10 müşteri |
| `/inventory` | 500'lük sayfalı liste, KPI, alt paneller (Purchases/Suppliers/Stocktake/Locations/Recipes/Reports/Categories), QR link, `?item=`; plan kapısı yok |
| `/files` | Klasik sipariş dosyaları + merkezi kütüphane (link/paylaş/çöp/sürüm); `client_files` (Pro+) + `clientFiles` erişimi |
| `/messages` | Ekip sohbeti/DM/grup, ek dosya; `messages` (yalnız Team) — kilit ekranı `/plan`'a yollar |
| `/quick-reply` | AI yanıtlar (OpenAI anahtarı Ayarlar'da); `quickReply` erişimi; menüden gizlenebilir |
| `/settings` (`?section=`) | 17 bölüm (Profil/Güvenlik, Tercihler, Branding, Portal domain, PDF, Workflow, AI, SMS, Finans, Ekip, Mesaj, Güvenli yükleme, Veri, Plan & Access, Entegrasyon hub, Destek); kaydedilmemiş değişiklik koruması |
| `/team` | Üyeler/roller/istekler; "Firebase UID ile üye ekle" gelişmiş formu; `teamAccess` |
| `/plan` | Plan/faturalama (Stripe checkout/portal, koltuk, depolama eklentisi); tamamı İngilizce, iç jargon |
| `/export` | Sunucu CSV (4 şablon) + müşteri CSV + 2 JSON yedek; `export_data` her planda açık |
| `/admin` | NivaDesk iç analitik; e-posta allowlist |
| `/track/[token]` `/e/[token]` | Müşteri portalı ve teklif onayı (oturumsuz); yalnız İngilizce |
| `/f/[...slug]` | Maskeli dosya görüntüleyici (token = sır); var-olmayan dosyada kırık görsel |
| `/chatgpt/connect` + OAuth route'ları | ChatGPT OAuth onay ekranı (e-posta/Google ile giriş; Apple yok) |
| `/connect/shopify` `/etsy/callback` `/square/callback` `/quickbooks/callback` `/xero/callback` `/pandle/callback` | Entegrasyon geri dönüşleri; QB/Xero/Etsy/Square → Cloud Function; Pandle oturumsuz kullanıcıda kodu kaybeder |

### B) Bulgular

### Kritik

1. **[Kritik] Web · Giriş ekranında şifre sıfırlama yok** · Şifresini unutan kullanıcı uygulamaya giremez; tek reset yolu oturum içindeki Ayarlar. · Kanıt: `app/login/page.tsx` (tüm dosya; `sendPasswordResetEmail`/"forgot" yok), `lib/studioflow/accountProfile.ts:187-190` (tek çağrı), `app/settings/page.tsx:45` (yalnız burada import). · Kontrol: Login'e "Forgot password?" eklenip `sendPasswordResetEmail` `/auth/action`'a bağlanacak mı?
2. **[Kritik] Web · Envanter fotoğraf modalı ürünün diğer alanlarını siler, stoku sıfırlar** · Fotoğraf ekle/sil yalnız 5 alan gönderir; sunucu ürünü girdiden yeniden kurar, yalnız `photos` için mevcut belgeye bakar → marka/SKU/konum/maliyet boşalır, miktar 0'a düşer. · Kanıt: `app/inventory/ItemPhotosModal.tsx:60-68` (`} as never, item.id)`), `functions/inventory.js:163-164, 208-209, 111-113`. · Kontrol: `normalizeItemInput` içinde `brand`/`onHand` için `existing` fallback var mı?
3. **[Kritik] Web · KDV kayıt (milestone) tarihi her kayıtta bir gün geri kayar** · Giriş yerel gece yarısı parse edilir, gösterim `toISOString()` (UTC) ile; UTC+3'te seçilen tarih bir gün önceki olarak görünür/kaydedilir. · Kanıt: `app/settings/page.tsx:4434-4436`, `:4428-4431`, `:4988`. · Kontrol: Türkiye/Almanya kullanıcısında tarih seç-kaydet-yeniden aç döngüsü.
4. **[Kritik] Web · Ödeme defterinden satır silme onaysız ve geri alınamaz** · "✎" yanındaki "×" yanlışlıkla tıklanınca sunucu paid/remaining'i yeniden hesaplar. · Kanıt: `app/orders/OrderDetailContent.tsx:6882`, `:4051-4053`. · Kontrol: Dosya silme (`:3667`) gibi onay eklenecek mi?

### Yüksek

5. **[Yüksek] Web · "+ Add Item" tıklanınca Remaining £0 ve düşük Order Value görünür, yenileyene kadar kalır** · Boş satır "kalem var" sayılır; sunucu boş satırı eler, başarıda reload yok. · Kanıt: `OrderDetailContent.tsx:4097-4098`, `:10120`; `functions/index.js:12360-12364`. · Kontrol: Boş kalemler optimistik hesaptan dışlanacak mı?
6. **[Yüksek] Web · Free/Starter sahibi Finansal Ayarlar'ı düzenleyebilir görür, sunucu reddeder** · Sahip için istemci kilidi yok; Save/Recalculate/Remove VAT sonrası hata, upgrade linki yok. · Kanıt: `app/settings/page.tsx:413`, `:454`, `:4460`; `functions/index.js:8569, 8744`. · Kontrol: Sahip için de `financial_advanced` kilidi + link gösterilecek mi?
7. **[Yüksek] Web · Banka akışı plan kapısı yalnız menüde** · Free/Starter sahibi `/bank` URL'sini yazıp "Connect bank" başlatabilir. · Kanıt: `components/AppShell.tsx:2087-2088`; `app/bank/page.tsx` (0 `entitlements` referansı). · Kontrol: Sunucu `bank_feed` kontrolü var mı?
8. **[Yüksek] Web · Dashboard "Bank Activity" para birimlerini toplar, iadeleri harcama sayar** · Etiket ilk satırın para birimi; `/bank` aynı ayı farklı gösterir. · Kanıt: `app/dashboard/page.tsx:1251`, `:1299` vs `app/bank/page.tsx:41`. · Kontrol: Dashboard `isSpend`+ana para birimi filtresini paylaşacak mı?
9. **[Yüksek] Web · /bank "Spending mix" toplamı ≠ üstteki "Total spent"** · Donut iade/para birimi filtresi uygulamaz. · Kanıt: `app/bank/page.tsx:1117` vs `:1582`. · Kontrol: Tek toplam fonksiyonu kullanılacak mı?
10. **[Yüksek] Web · "vs last month" filtreli/filtresiz karşılaştırır** · PayPal kaynak çipi veya yabancı para satırlarında anlamsız yüzde. · Kanıt: `app/bank/page.tsx:1077` vs `:1584`. · Kontrol: —
11. **[Yüksek] Web · Banka tarihleri UTC parse; UTC batısında bir gün erken** · Dashboard'da korunan tuzak /bank'ta yok. · Kanıt: `app/bank/page.tsx:2098` (aynı kalıp `new Date(tx.bookingDate).toLocaleDateString(undefined…` ile 9 yerde daha), koruma `app/dashboard/page.tsx:393`. · Kontrol: —
12. **[Yüksek] Web · Tüm banka akışı limitsiz, canlı, iki sayfada indirilir** · Yıllar geçtikçe her açılışta binlerce doküman. · Kanıt: `app/bank/page.tsx:400`, `app/dashboard/page.tsx:495` (limit yok). · Kontrol: Dönem bazlı `limit`/`where` eklenecek mi?
13. **[Yüksek] Web · Sipariş listesi, araç çubuğu marjı ve export tüm siparişleri indirir; filtre değişince Çöp için tekrar** · Kanıt: `lib/studioflow/firestore.ts:1413-1416`, `:1167-1168`, `:1745`; `components/AppShell.tsx:1169`; `app/orders/page.tsx:287-288`. · Kontrol: Büyük workspace'lerde açılış süresi ölçüldü mü?
14. **[Yüksek] Web · Onarım kabulünde "Add photos" hiçbir şey yapmaz** · Client Files kartı gizliyken/izin yokken tıklanan input DOM'da yok. · Kanıt: `OrderDetailContent.tsx:6147`, `:7900-7901`. · Kontrol: Düğme `canManageClientFiles` ile de kapatılacak mı?
15. **[Yüksek] Web · Müşteriye giden PDF'ler (fatura, iş fişi) her dilde İngilizce; KDV etiketi yuvarlanır** · "BILL TO/JOB SHEET"; 8,25% oran "VAT (8%)" basılır. · Kanıt: `OrderDetailContent.tsx:877`, `:1067`, `:1010`. · Kontrol: —
16. **[Yüksek] Web · Müşteri portalı ve teklif onay sayfaları yalnız İngilizce** · Türk/Alman kuyumcunun müşterisi İngilizce sayfa görür. · Kanıt: `app/track/[token]/CustomerPortalContent.tsx:97, 103, 132, 169, 173, 212`; `app/e/[token]/EstimateApprovalContent.tsx:143, 257, 273`. · Kontrol: Sunucu workspace dilini `portal`/`estimate` payload'ına ekleyebilir mi?
17. **[Yüksek] Web · ChatGPT bağlantı ekranında Apple ile giriş yok, ham Firebase hatası** · Yalnız Apple hesabı olan kullanıcı ChatGPT'yi bağlayamaz. · Kanıt: `app/chatgpt/connect/ChatGPTConnectClient.tsx:6`, `:184`, `:301`; `:174`, `:186`. · Kontrol: —
18. **[Yüksek] Web · Google/Apple ile kayıtta form atlanır** · Girilen çalışma alanı adı/dil kaybolur, `initializeFreeDemoWorkspace` çağrılmaz; `AuthProvider` "My Studio" oluşturur. · Kanıt: `components/PublicMarketing.tsx:3542-3547`, `:3601`, `:3511`; `lib/auth/AuthProvider.tsx:146-150`. · Kontrol: `ensurePersonalWorkspace` callable ile aynı kurulumu (deneme, dil) yapıyor mu?
19. **[Yüksek] Web · Satır içi başlık yeniden adlandırma sessizce kaybolur** · Yazma hatası yutulur; yeni ad yenilemeye kadar görünür, sonra gider. · Kanıt: `OrderDetailContent.tsx:4235-4237`, `:4292`, `:4312`, `:4334`. · Kontrol: Snapshot re-sync gerçekten tetikleniyor mu?
20. **[Yüksek] Web · Dashboard erişimi olmayan admin'e mevcut workspace için kurulum sihirbazı çıkabilir** · Finans yüklenmeyince `financeOrders=[]` + `loaded=true` → "0 sipariş" kabul edilir. · Kanıt: `components/AppShell.tsx:1164-1178`, `:1649-1656`. · Kontrol: `businessOnboardingCompleted` eski workspace'lerde set mi?
21. **[Yüksek] Web · Mobilde sipariş silme/iptal/atama/birleştirme yok** · Bu aksiyonlar yalnız masaüstü listesinin sağ-tık menüsünde; <981px liste gizlenir, detayda silme yok. · Kanıt: `app/orders/page.tsx:994` (yalnız `onContextMenu`); `OrderDetailContent.tsx` (`deleteOrderFromWeb` 0 referans); `app/globals.css:11718-11736`. · Kontrol: Kartlara "⋯" düğmesi eklenecek mi?
22. **[Yüksek] Web · Plan & Billing sayfası İngilizce, iç jargon ve geliştirici notları içerir, kendisiyle çelişir** · "Source: legacy_default", "Status: trialing", "Server-side recalculation can be connected later", "These keys should stay shared…", matris depolama eklentisi "Coming soon" derken altında satılıyor; "Lite" adı hâlâ var. · Kanıt: `app/plan/page.tsx:293, 296, 330, 350, 369-371, 453, 469`; linkler `app/settings/page.tsx:6504, 6624`, `app/messages/page.tsx:634`. · Kontrol: Sayfa canlı satın alma yüzeyi mi, yoksa Settings › Plan & Access'e katlanacak mı?
23. **[Yüksek] Web · Bildirim merkezi tamamen İngilizce** · `studioT` hiç kullanılmaz. · Kanıt: `components/NotificationsDrawer.tsx:205-206`, `:210`, `:219`. · Kontrol: —
24. **[Yüksek] Web · Bildirim kapatma yalnız sağ tık; iOS'ta imkânsız, yanlışlıkla kalıcı** · Kanıt: `components/NotificationsDrawer.tsx:391`. · Kontrol: —
25. **[Yüksek] Web · Push izni ilk yüklemede jestsiz istenir, reddedilene kadar her sayfada tekrar** · Kanıt: `lib/studioflow/pushNotifications.ts:60-61, 64-66`; `components/AppShell.tsx:1496`. · Kontrol: Chrome "quiet UI"/otomatik engelleme gözlendi mi?
26. **[Yüksek] Web · `/settings?section=paypal` Profile & Security'yi açar** · /bank'ın "Connect PayPal" ve "Reconnect" düğmeleri yanlış yere gider. · Kanıt: `app/settings/page.tsx:160-175` (alias yok), `:543`, `:558-561`; `app/bank/page.tsx:1658, 1819`. · Kontrol: —
27. **[Yüksek] Web · Branding'de değiştirilen çalışma alanı adı, Profile kaydında eskiye döner** · `workspace` bir kez yüklenir, gizli `companyName` bayat değeri yollar. · Kanıt: `app/settings/page.tsx:615`, `:3800`, `:3915`. · Kontrol: Sunucu `companyName`'i sahip için koşulsuz yazıyor mu?
28. **[Yüksek] Web · Üyeler için Integrations hub bağlı Woo/webhook'u "bağlı değil" gösterir** · Reddedilen okumalar boş sayılır. · Kanıt: `lib/studioflow/integrations.ts:172`, `:205-206`, `:280-281`. · Kontrol: Sinyal callable'ları owner-only mı?
29. **[Yüksek] Web · WooCommerce `needs_reconnect` çıkmaz sokak** · Sync kapalı, hata gösterilmez, Reconnect yok. · Kanıt: `app/settings/WooCommerceIntegrationSection.tsx:43, 96, 121, 146`. · Kontrol: —
30. **[Yüksek] Web · Home: workspace yüklenemezse sonsuz "Loading"** · try/catch yok. · Kanıt: `app/home/page.tsx:146-147`, `:280`. · Kontrol: —
31. **[Yüksek] Web · Home telefonda kartlar taşınamaz ama "Drag cards to rearrange" der; yeni workspace'te 8 kart "Nothing here yet."** · Kanıt: `app/globals.css:29678`; `app/home/page.tsx:382`, `:297`; CTA desteği kullanılmıyor `components/home/HomeCardShell.tsx:378-379`. · Kontrol: —
32. **[Yüksek] Web · Home "Recent activity" satırları var olmayan rotalara gider** · `route` doğrudan URL yapılır (`/supportTicket` vb.). · Kanıt: `components/home/HomeCardBodies.tsx:1690`. · Kontrol: Sunucu `route` değerleri nelerdir?
33. **[Yüksek] Web · Envanter: fotoğraf yükleme hatası hiç görünmez; rezervasyon linki ölü; view-only üyeye tam düzenleme UI** · Kanıt: `app/inventory/InventoryContent.tsx:954-957` (unmount sonrası setError); `app/inventory/ItemDetailPanel.tsx:370` (`/orders?order=` okunmaz); `app/inventory/page.tsx:73` (rol yok sayılır). · Kontrol: —
34. **[Yüksek] Web · Satın almada virgüllü ondalık 10 kat miktar** · `1,5` → 15. · Kanıt: `app/inventory/PurchasesPanel.tsx:69-71`. · Kontrol: TR/DE klavye ile test.
35. **[Yüksek] Web · Onaysız yıkıcı işlemler** · Mesaj "delete for everyone", not "Delete forever", görev/hatırlatıcı silme, reçete/konum silme, özel domain kaldırma, banka toplu "Clear category", Home "Reset layout". · Kanıt: `app/messages/page.tsx:340-346, 1506`; `app/notes/page.tsx:1126 → 295-297`; `OrderDetailContent.tsx:7782, 7320`; `app/inventory/RecipesPanel.tsx:98-106, 156`; `app/inventory/LocationsPanel.tsx:186`; `app/settings/ClientDomainSection.tsx:224`; `app/bank/page.tsx:2244`; `app/home/page.tsx:383`. · Kontrol: Toast+Undo altyapısı (`StudioToastHost`) kullanılacak mı?
36. **[Yüksek] Web · Ham Firebase/callable hataları kullanıcıya gösteriliyor** · "Firebase: Error (auth/invalid-credential)", "internal", "Missing or insufficient permissions". · Kanıt: `app/login/page.tsx:73`; `components/AuthProviders.tsx:73`; `app/auth/action/page.tsx:127`; `lib/studioflow/orders.ts:200-204`; `lib/studioflow/firestore.ts:2191-2200` → `app/orders/page.tsx:1286-1289`; `app/export/page.tsx:53`; `app/bank/page.tsx:1813`; `app/settings/page.tsx:5661`; `app/messages/page.tsx:345`. · Kontrol: `sms.ts`/`clientDomain.ts` tarzı ortak eşleyici kullanılacak mı?

### Orta

37. **[Orta] Web · Free limitleri yalnız hata sonrası öğrenilir** · 11. sipariş/müşteri sunucuda reddedilir; yaklaşım uyarısı yok, sayaç yalnız Plan & Access'te. · Kanıt: `lib/studioflow/orders.ts:190-191`; `lib/studioflow/customers.ts:84-85`; `app/settings/page.tsx:6514, 6519`. · Kontrol: —
38. **[Orta] Web · Deneme/ilk sipariş toast'ları çevrilmez** · Kanıt: `lib/studioflow/orders.ts:242-243`, `:277-278`. · Kontrol: —
39. **[Orta] Web · Order/Project/Job terminolojisi karışık** · Menü "Orders", düğme "Add Project", çöp "order", PDF "JOB SHEET". · Kanıt: `components/AppShell.tsx:103` vs `:2254, 2259`; `app/orders/page.tsx:667, 1193`; `OrderDetailContent.tsx:877`. · Kontrol: —
40. **[Orta] Web · `window.confirm` metinleri İngilizce sabit** · Kanıt: `app/orders/page.tsx:486-488, 523-525, 649, 667`; `app/customers/page.tsx:620`; `app/files/page.tsx:498`; `app/messages/page.tsx:474`; `app/inventory/PurchasesPanel.tsx:139-142`; `OrderDetailContent.tsx:3667`. · Kontrol: —
41. **[Orta] Web · Notlar: yerel `alert()` ve ham hata; hatırlatıcı tarihi UTC** · `type="date"` UTC gece yarısı → batı zaman dilimlerinde bir akşam önce "gecikmiş", rozet sayar. · Kanıt: `app/notes/page.tsx:264, 272, 598`; `:1082-1084`; `components/AppShell.tsx:1476-1477`. · Kontrol: —
42. **[Orta] Web · Notlar telefonda aksiyonsuz** · Renk/hatırlatıcı/arşiv gizlenir. · Kanıt: `app/notes/page.tsx:888, 899, 1045`. · Kontrol: Editörden hepsine ulaşılıyor mu?
43. **[Orta] Web · Sipariş kartı: "BOYA" kısaltması İngilizce UI'da, durumlar yalnız Türkçeye çevrilir, İngilizce sabitler** · Kanıt: `components/OrderListCard.tsx:173-174`, `:180-197`, `:57-58, 350-351, 392-397, 403`, `:72` (en-GB). · Kontrol: —
44. **[Orta] Web · Para formatı üç farklı yol** · Sipariş: en-GB + workspace ondalık; envanter/banka: tarayıcı yerel ayarı; Ayarlar önizleme: en-GB sabit. · Kanıt: `lib/studioflow/money.ts:18`; `components/PricePrivacy.tsx:65`; `app/bank/page.tsx:1603`; `app/settings/page.tsx:4665`. · Kontrol: —
45. **[Orta] Web · Tarihler uygulama dilini izlemiyor (en-GB sabit)** · `studioLocaleTag` varken. · Kanıt: `components/AppShell.tsx:247`; `OrderDetailContent.tsx:124, 137, 142, 153, 178`; `app/customers/page.tsx:71, 76`; `app/team/page.tsx:37`; `app/files/page.tsx:39`; `app/schedule/page.tsx:135, 140` (çağrılar `:284, 335, 734`); `app/settings/page.tsx:262, 8043`. · Kontrol: —
46. **[Orta] Web · `t()` içinde ama çeviri tablosunda olmayan anahtarlar; sessiz İngilizce fallback** · "VAT Rule", "Shipping Cost", "Remaining", "Courier", "Placed On" tabloda 0 kayıt. · Kanıt: `OrderDetailContent.tsx:6960, 6950`; `lib/studioflow/language.ts:6431-6435`. · Kontrol: Eksik anahtar için dev-log eklenecek mi?
47. **[Orta] Web · Sabit İngilizce UI (t() dışı)** · Yükleme ekranı, e-posta doğrulama, auth/action, export, mesaj kilit ekranı, ekip formu, ikon başlıkları. · Kanıt: `components/LoadingScreen.tsx:21-22`; `components/VerifyEmailGate.tsx:190-204`; `app/auth/action/page.tsx:135-185`; `app/export/page.tsx:106, 122, 134, 187`, `components/ExportOrdersPanel.tsx:220`; `app/messages/page.tsx:622-637, 710, 729, 741, 1600`; `components/TeamMemberAccessForm.tsx:50-56`; `components/StudioToastHost.tsx:66`; `app/files/page.tsx:426, 498, 584`; `app/orders/[orderId]/page.tsx:139`. · Kontrol: —
48. **[Orta] Web · Ekip üyesi ekleme "Firebase UID" ister** · Kanıt: `components/TeamMemberAccessForm.tsx:50-56`; `app/settings/page.tsx:7040`. · Kontrol: Bu form gerçekten kullanıcıya açık mı?
49. **[Orta] Web · Team olmayan sahip ekip yönetimini nasıl açacağını göremez** · Kanıt: `app/settings/page.tsx:6740-6741, 6886`; `app/team/page.tsx:409` (link yok). · Kontrol: —
50. **[Orta] Web · Oturum kilidi sayfa yenilemeyle aşılır; odak tuzağı yok** · Kilit yalnız state'te. · Kanıt: `components/SessionAutoLock.tsx:30`, `:150`. · Kontrol: Kilit `sessionStorage`'a yazılacak mı?
51. **[Orta] Web · Workspace değişince zorla sayfa yenilenir (yazılan form kaybolur); herkese hayalet "My Studio" workspace** · Kanıt: `lib/auth/AuthProvider.tsx:189`; `:51, 146-150`; `lib/studioflow/firestore.ts:1039-1041`. · Kontrol: Davet edilen üyenin kişisel workspace'i istenen davranış mı?
52. **[Orta] Web · Onboarding plan adımı para birimi seçilse de "£9/£19/£49" gösterir** · Kanıt: `lib/studioflow/onboardingWizard.ts:85-87`; `components/OnboardingWizard.tsx:497-498`. · Kontrol: —
53. **[Orta] Web · Portal anahtarları busy/optimistik durum olmadan; hızlı tıklamada son yazan kazanır** · Kanıt: `OrderDetailContent.tsx:5551`, `:5962-5963`. · Kontrol: —
54. **[Orta] Web · Not bölümü başlığı her tuş vuruşunda callable** · Kanıt: `OrderDetailContent.tsx:8053`. · Kontrol: —
55. **[Orta] Web · Ödeme formu hata olsa da temizlenip kapanır; negatif tutar sessizce 0** · Kanıt: `OrderDetailContent.tsx:4046-4048`; `:1625`. · Kontrol: Manuel iade bilinçli olarak yalnız banka akışında mı?
56. **[Orta] Web · "Full Payment Received" özel alacak başlıklarında kapalı; ödeme yöntemi listeleri uyuşmuyor** · Kanıt: `OrderDetailContent.tsx:6768`; `:6798` vs `:6895-6897`. · Kontrol: Sunucu bu durumu kabul ediyor mu?
57. **[Orta] Web · 6'dan fazla hatırlatıcı görünmez; kütüphane dosyası açma popup-blocker'a takılır; kilit mesajları link vermiyor/yanlış sayfaya gidiyor** · Kanıt: `OrderDetailContent.tsx:7284`; `:7999-8000`; `:3076, 5275`, `:11097` (`/dashboard`). · Kontrol: —
58. **[Orta] Web · Kargo firması sabit 5 seçenek** · Kanıt: `OrderDetailContent.tsx:1343`. · Kontrol: "Auto Detect" diğer kargoları kapsıyor mu?
59. **[Orta] Web · /bank: sekmeler 0 işlemle ulaşılamaz; dinleyicilerde hata callback'i yok; "Connected" bayatlamaz; Reconnect yeni bağlantı açar; yıllık aboneliğe "/ month"** · Kanıt: `app/bank/page.tsx:2645, 2809`; `:379, 399`; `:393, 1797, 1811`; `:1822, 1831`; `:2029` vs `:2573`. · Kontrol: Sunucu rıza bitince `syncState`'i güncelliyor mu; finalize eski bağlantıyı değiştiriyor mu?
60. **[Orta] Web · Dashboard: Extra Spending iptal edilenleri sayar; "$"=USD varsayımı; Pro kilidi upgrade linksiz** · Kanıt: `app/dashboard/page.tsx:1098` vs `:622`; `:172, 647-649`; `:946, 834`. · Kontrol: —
61. **[Orta] Web · Export tarih ön ayarları UTC, dashboard yerel gün yollar** · Kanıt: `lib/studioflow/exportOrders.ts:88-90`. · Kontrol: "Sunucuyla eşleşme" bilinçli mi?
62. **[Orta] Web · Ayarlar telefonda derin link liste ekranında kalır; "View plans"/avatar→Account ayarlar içindeyken çalışmaz** · Kanıt: `app/settings/page.tsx:511-512, 558-561, 912`; `components/AppShell.tsx:2172-2178` benzeri `router.push`'lar `?section` yalnız mount'ta okunur (`:533-562`). · Kontrol: —
63. **[Orta] Web · Workflow'da sektör/şablon değiştirmek kaydedilmemiş taslağı sessizce kaydeder; "Recalculate" önce taslağı kaydeder** · Kanıt: `app/settings/page.tsx:2022-2023`; `:4558-4559`. · Kontrol: İkincisi bilinçliyse düğme ipucu bunu söyleyecek mi?
64. **[Orta] Web · Ayarlar: hata metni yeşil "success" sınıfında; webhook kartı hatayı "Unavailable"a yutar; AI menü anahtarı sessizce geri döner; PDF önizleme sonsuz "Loading" olabilir** · Kanıt: `app/settings/page.tsx:5661 → 5726`; `:5637-5645`; `:2953-2964`; `:2562-2563`. · Kontrol: —
65. **[Orta] Web · QuickBooks/Xero "Importing the chart of accounts…" bildirimi hiç kapanmaz** · Kanıt: `app/settings/QuickBooksIntegrationSection.tsx:194, 224, 231`. · Kontrol: —
66. **[Orta] Web · Envanter: düşük stok rozeti ile liste farklı kural; "Record a Loss" formu sonraki ürüne taşınır; uzun formlar arka plana tıklamayla kapanır; sayımda NaN** · Kanıt: `app/inventory/InventoryContent.tsx:241, 687`; `app/inventory/ItemDetailPanel.tsx:135-137, 140`; `app/inventory/PurchasesPanel.tsx:423`, `app/inventory/OpeningStockModal.tsx:171`; `app/inventory/StocktakePanel.tsx:280-281`. · Kontrol: Sunucu düşük stok sayımı (`functions/inventory.js`) rezerve satırları da sayıyor mu?
67. **[Orta] Web · Satın alma "Match payment" tüm banka defterini indirir, sonucu `alert` ile verir; reçete/kategori hataları modalın arkasında** · Kanıt: `app/inventory/PurchasesPanel.tsx:739, 782`; `app/inventory/RecipesPanel.tsx:133, 165`. · Kontrol: —
68. **[Orta] Web · Dosyalar: bağlantı için ham kayıt ID'si; Free kullanıcı upgrade linksiz kütüphaneye düşer; küçük resimler tam boy ve eager; `/f` süresi dolmuş dosyada kırık görsel** · Kanıt: `app/files/FilesLibraryView.tsx:591-596`; `app/files/page.tsx:231, 562-566`; `:761`; `app/f/[...slug]/route.ts:129-130, 147`. · Kontrol: —
69. **[Orta] Web · Home: hızlı aksiyon/not kartları sipariş yüklemesine bağlı; banka hatası "Nothing here yet."; grafik formülü tile'dan farklı; "Set up business profile" hep işaretli; "View all activity" Orders'a gider** · Kanıt: `app/home/page.tsx:63-64`; `lib/studioflow/useHomeData.ts:317`; `components/home/HomeCardBodies.tsx:273-274`; `:2184`; `lib/studioflow/homeCards.ts:114-115`. · Kontrol: —
70. **[Orta] Web · Bildirim tıklaması sipariş kimliğini düşürür; "How to enable" `chrome://` açmaya çalışır; okundu/işaretleme hataları yutulur** · Kanıt: `components/NotificationsDrawer.tsx:172-174`; `:280`; `:109, 130, 132, 148`. · Kontrol: —
71. **[Orta] Web · Pandle callback oturumsuz kullanıcıda OAuth kodunu kaybeder; hub Pandle'ı "Coming soon" listelerken Banking'de bağlantı kartı var** · Kanıt: `app/pandle/callback/page.tsx:25`; `lib/studioflow/integrations.ts:100-101`; `components/PandleCard.tsx`. · Kontrol: `NEXT_PUBLIC_PANDLE_ENABLED` üretimde açık mı?

### Düşük

72. **[Düşük] Web · Kart menüsünde "Width" başlığı yüksekliği değiştirir; özel siparişte "Repair status" etiketi** · Kanıt: `OrderDetailContent.tsx:5367`; `:5956`. · Kontrol: —
73. **[Düşük] Web · Takvim ipucu metinleri İngilizce ("Created:", "Delivery Due:")** · Kanıt: `app/schedule/page.tsx:330-336`. · Kontrol: —
74. **[Düşük] Web · Tarayıcı yerel ayarına bağlı tarih/saat (65 yer, /bank'ta 20)** · OS dili ≠ uygulama dili olunca karışık. · Kanıt: `app/bank/page.tsx:1809, 1884`; `app/notes/page.tsx:1027`. · Kontrol: —
75. **[Düşük] Web · Plan guard varsayılan mesajları her aksiyonda "upload"dan söz eder** · Kanıt: `lib/studioflow/planActions.ts:22, 30`. · Kontrol: —
76. **[Düşük] Web · `/notes` rotası üye erişimiyle korunmuyor (yalnız menüde gizli)** · Kanıt: `components/AppShell.tsx:133`; `app/notes/page.tsx:117-125`. · Kontrol: Firestore kuralları notları rol bazlı kısıtlıyor mu?
77. **[Düşük] Web · Dashboard erişimi olmayan üye açıklamasız /orders'a atılır; aktif/yakında sayaçları 1.000 örnekten** · Kanıt: `app/dashboard/page.tsx:555-561`; `lib/studioflow/firestore.ts:1106`. · Kontrol: —
78. **[Düşük] Web · /bank: PayPal ücreti gizli-rakam anahtarını atlar; durum mesajı sayfanın tepesinde; sabit 248px grid mobilde taşar; `<th>` sıralama klavyesiz; "Delete imported data" %50 opak emoji** · Kanıt: `app/bank/page.tsx:3516`; `:1666`; `:2830`; `:2274`; `:1833`. · Kontrol: —
79. **[Düşük] Web · Tercihler'de kişisel dil ayarı workspace iznine bağlı** · Kanıt: `app/settings/page.tsx:1194`. · Kontrol: —
80. **[Düşük] Web · Home ilerleme çubuğu tüm adımlar atlanınca NaN%** · Kanıt: `components/home/HomeCardBodies.tsx:2181`, `:2327`. · Kontrol: —

**Öncelik sırası önerisi:** #1 (şifre sıfırlama), #2 (envanter veri kaybı), #3 (KDV tarihi), #4/#5 (ödeme/kalem), ardından banka para hesapları (#8–#11) ve mobil sipariş aksiyonları (#21).


---

# 3) SUNUCU VE KURALLAR — Cloud Functions, firestore.rules, storage.rules

Denetim tamamlandı (yalnızca okuma yapıldı; hiçbir dosya değiştirilmedi, emülatör/deploy çalıştırılmadı). Rapor aşağıda.

## A) Sunucu haritası

- **Kimlik/çalışma alanı çözümleme:** Tüm callable'lar `requireWorkspaceForBilling` (index.js:2638) ile `request.data.companyId` ya da `users/{uid}.activeCompanyId` (2625) üzerinden şirketi bulur; üyelik `uidHasCompanyAccess` (members/memberRoles), sahiplik `ownerUid` (2461). Bölge: tüm fonksiyonlar `europe-west2` (bölgesiz onCall/onRequest yok).
- **Plan/entitlement:** `PLAN_ENTITLEMENTS` (1960-2100), `billingPlanFromCompanyData` (2235) trial bitimini anlık hesaplar (36 saat tolerans, 2124-2135); dokümana geri yazan bir "trial bitti" işi YOK. Limit kontrolü `validateBillingAction` (2883) yalnızca callable'larda: createWebOrder (14354), createSwiftOrder (15039), createWebCustomer (13795), appendClientFile (15652), addWorkspaceTeamMember/approveJoin (16410/16116), importWorkspaceBackup (10655), webhook'lar `integrationOrderCapacity` (2700) ile "held" kuyruğu.
- **Sipariş yazma yolları:** Web → callable'lar; Mac/iPhone Free/Starter/assigned-scope → `createSwiftOrder/saveSwiftOrder` (FirebaseManager.swift:1133), Pro/Team → **doğrudan Firestore, tam doküman değiştirme** (`setData(from:)` FirebaseManager.swift:2206); rules `siparisler` için yalnızca rol + gelişmiş finans alanı kapısı uygular, **sayı limiti uygulamaz**.
- **Faturalama rayları:** Stripe webhook → `processStripeEvent` (stripeBilling.js:1176, event-id idempotent) → `recomputeEffectiveWorkspaceEntitlement` (740) ledger'dan en yüksek aktif planı seçer; Apple/Google kendi verify + notification (1627/2042); Shopify doğrudan şirket dokümanına yazar (index.js 29200-29300); saatlik `scheduledBillingEntitlementReconcile` (2142) süresi geçen aktif abonelikleri düşürür.
- **Ekip:** join request → approve (16116) / manual add (16410) / role/access update / remove (16638); erişim aynası `users/{uid}/workspaceAccess/{cid}`; `reconcileAcceptedJoinRequests` (16070) kabul edilmiş istekleri yeniden ekler.
- **Silme/temizlik:** deleteWebOrder soft (14730) → 30 gün sonra `purgeDeletedOrders` (11237, recursiveDelete); dosya blob'ları `pendingFileDeletions` ile 30 gün sonra (11203/11468); `deleteWorkspaceData` (11011) hard-delete; `deleteMyAccount` (29025); `cleanupStaleUnverifiedAccounts` (11420, CANLI mod).
- **Müşteriye giden mesajlar:** `notifyCustomerOnStatusChange` trigger (25924; e-posta + Twilio SMS), portal linkleri `portalLinks/{sha256}` (25775), teklif linkleri `estimateLinks/{sha256}` (26460), ikisi de IP+token oran sınırlı (`websiteChatCheckRate` 3563).
- **Zamanlanmış işler:** hepsi Europe/London; `scheduledReminderCheck` 15 dk (17811), `scheduledTrackingRefresh` 60 dk (17716), banka 8 saat (bankFeed.js:720), muhasebe 6 saat, ticaret 15 dk.
- **Rules deseni:** `companies/{cid}/{collectionId}` joker kuralı **reddetme listesi** (firestore.rules:800-905): listede olmayan her alt koleksiyon owner/admin/member'a yazılabilir, viewer dahil herkese okunabilir. `companySettings/{cid}` üyeye yazılabilir (928-950). Storage üyelik kanıtı olarak `users/{uid}/workspaceAccess` dokümanını da sayar (storage.rules:34-66).
- **Muhasebe/ticaret idempotency:** posting fingerprint (accounting/core/fingerprint.js), webhook inbox `.create()` (accountingFunctions.js:646), commerce `idempotencyKey` + `lastEventKey` (commerce/events.js:72, engine.js:63), Shopify/Woo teslimat id'si (index.js:30578, wooConnector.js:330). Payout eşleştirme skor ≥85 & marj 15 (commerce/settlements.js:21-22), "unlink" geri alma var (settlementMatch.js:128).

## B) Bulgular

**1. [Kritik] Rules/Storage · Kullanıcı kendine "üyelik kanıtı" yazıp başka çalışma alanının dosyalarına erişebiliyor**
Sorun: Çıkarılmış eski üye (ya da Company ID'yi bilen herkes) `users/{kendi}/workspaceAccess/{hedefCid}` dokümanını `{role:"admin"}` ile kendisi yazar; storage.rules bunu üyelik sayar → `design_images`, `support_files`, `client_files/{orderId}/*` okur/yazar/siler, `signatures` okur.
Kanıt: firestore.rules:411-419 (`userId == request.auth.uid` ile create/update), storage.rules:34-37 (`workspaceAccessExists`), 61-66 (`hasMemberRecord`), 79-98 (`canEditWorkspaceFiles` → `workspaceAccessRole`), 121-160; index.js:16680 (removeWorkspaceTeamMember accessRef'i siler ama kullanıcı yeniden yazabilir).
Kontrol: Herhangi bir istemci `workspaceAccess`'i kendisi yazıyor mu (self-repair)? Yazmıyorsa create/update sadece `isCompanyOwner`'a kısıtlanmalı, storage'da `workspaceAccess` fallback'i kaldırılmalı.

**2. [Kritik] Sunucu · Zamanlanmış hatırlatmalar yalnızca `test_studio_123` için çalışıyor**
Sorun: Kart/schedule alarmları (`__scheduleAlertItemsV1`) hiçbir gerçek çalışma alanında bildirim/push üretmez; kullanıcı "hatırlatma kurdum, gelmedi" der.
Kanıt: index.js:17817-17820 `.where("companyId","==","test_studio_123")`, 17852; alan anahtarı 12859. Not `reminderDate` için de bir zamanlayıcı bulunamadı (yalnızca yazım: 1200-1208, 22472).
Kontrol: Hatırlatmalar istemci-yerel bildirimle mi karşılanıyor? Değilse sorgu `collectionGroup`/tüm şirketler olmalı.

**3. [Kritik] Rules · `paypalPayouts` / `squarePayouts` alt koleksiyonları reddetme listesinde yok**
Sorun: Banka verisi owner-only iken, payout tutarları her üyeye (viewer dahil) okunur; owner/admin/member `bankMatch` alanını doğrudan değiştirip mutabakatı bozabilir.
Kanıt: bankFeed.js:612 (`companies/{cid}/paypalPayouts`), squareConnector.js:46,606 (`squarePayouts`), firestore.rules:800-905 (listede yok), joker yazma `canWriteCompanyData`.
Kontrol: Bu iki koleksiyon + `trackingResults` (index.js:248-256) listeye eklenmeli; `canReadBankFeed` ile okunmalı.

**4. [Kritik] Rules · `companySettings` üye tarafından doğrudan yazılabiliyor; SMS ve finans kapıları atlanıyor**
Sorun: Owner-only `saveWorkspaceSmsSettings` ve Pro+ kapılı `saveFinancialSettings` boşa düşer: bir member `smsTriggers/smsSenderId/smsDefaultCallingCode`, `defaultTaxRate/feePercentage/seciliParaBirimi` alanlarını istemciden yazar → gerçek SMS maliyeti / yanlış vergi.
Kanıt: firestore.rules:928-950 (yalnızca AI anahtarları korunuyor), index.js:25436-25441 (owner şartı), 25460 (SMS alanları companySettings'e), 8557-8570 (plan kapısı), 8434-8439 (okunan finans alanları).
Kontrol: Bu alanlar `protectedBillingFields` benzeri bir listeye alınıp callable'a zorlanmalı mı?

**5. [Yüksek] Sunucu · Onaylanan/çöpe atılan sipariş workflow-only üyeye geri geliyor**
Sorun: Owner silme isteğini onaylar, view silinir, ama soft-delete tetikleyiciyi çalıştırır ve `assignedToUid` dolu olduğu için view yeniden yazılır; view alan listesinde `isDeleted` olmadığından üye çöpteki siparişi "aktif" görür.
Kanıt: index.js:11119-11128 (WORKFLOW_ORDER_VIEW_FIELDS'te isDeleted yok), 11133-11141 (`writeWorkflowSafeOrderView` isDeleted'e bakmaz), 11171-11200 (trigger), 14654 (approve view'i siler), 14730-14760 (deleteWebOrder soft).
Kontrol: `writeWorkflowSafeOrderView` `isDeleted===true` iken view'i silmeli.

**6. [Yüksek] Sunucu · Müşteri silince tüm geçmiş siparişler "New Project" oluyor, iletişim bilgileri siliniyor**
Sorun: Bir müşteri kaydını silen kullanıcı, o müşterinin bütün siparişlerinde adın "New Project"e döndüğünü, e-posta/WhatsApp/Instagram'ın silindiğini görür (faturalarda müşteri adı kaybolur); geri alma yok, onay ekranında etkilenecek sipariş sayısı önceden söylenmez.
Kanıt: index.js:13728-13790 (`customerName: "New Project"`, alanlar boşaltılır), 13889-13935.
Kontrol: Beklenen davranış "müşteri kaydı silinsin, siparişlerdeki ad kalsın" değil mi? En azından clearedOrderCount'u önizleme olarak döndürmek.

**7. [Yüksek] Sunucu · `mergeOrders` rol kontrolü yapmıyor; View Only üye sipariş birleştirip çöpe atabilir**
Sorun: Viewer, rules'ta yazamaz ama bu callable `access.orders` (varsayılan true) dışında rol bakmıyor; kaynak siparişler çöpe gider, para birleşir.
Kanıt: index.js:9143-9150 (`requireNotificationWorkspaceAccess` + sadece `access.orders`), 2483-2549 (viewOnly için `orders` varsayılanı kapanmıyor), 9180-9215.
Ek (Orta, verify): birleştirmede kaynak siparişin değeri toplam tutara eklenmez, sadece `remaining -= sourcePaid` → farklı işler birleştirilirse toplam küçülür (9205-9215).

**8. [Yüksek] Sunucu · Hesap silme `companySettings`, `quickReplySecrets` (OpenAI anahtarı) ve birçok kök koleksiyonu bırakıyor**
Sorun: Silinen hesabın AI anahtarı, marka/SMS ayarları, portal/teklif linkleri, özel domain kaydı, join request'ler ve `fileShares` kalır; ekip üyelerinin `activeCompanyId`/`workspaceAccess` kayıtları ölü çalışma alanını gösterir → üyeler "Workspace not found" döngüsüne düşer.
Kanıt: index.js:29025-29120 (liste: siparisler, musteriler, notes, messages, workspaceTickets, supportTickets + `companies/{uid}` + `users/{uid}`), 7678 (`quickReplySecrets/{cid}`), 25775 (`portalLinks`), 26460 (`estimateLinks`), 24936 (`fileShares`); test yalnızca 6 koleksiyonu doğruluyor (test/qa/account-deletion-coverage.test.js).
Kontrol: `companySettings/{uid}`, `quickReplySecrets/{uid}`, `clientDomains`, `workspaceJoinRequests(targetCompanyId)`, `portalLinks/estimateLinks(companyId)` eklenmeli; üyelerin `activeCompanyId`'si kendi uid'lerine çekilmeli.

**9. [Yüksek] Sunucu · Üyelikten çıkarılan kullanıcının `activeCompanyId`'si sıfırlanmıyor (yarı kilitlenme)**
Sorun: Onayda aktif çalışma alanı otomatik hedef şirkete çevrilir; çıkarılınca geri alınmaz → her callable "You do not have access to this workspace" döner; web `activeCompanyId`'yi takip ettiği için kullanıcı kendi alanına nasıl döneceğini bulamayabilir.
Kanıt: index.js:16158-16161 (approve `activeCompanyId` yazar), 16638-16709 (remove yazmaz), 2625-2636, studioflow-web/lib/auth/AuthProvider.tsx:172-186.
Kontrol: İstemcilerde "erişim yok → kendi alanına dön" fallback'i var mı?

**10. [Yüksek] Sunucu · Mac/Android'den kayıt olan hiç 14 günlük deneme almıyor**
Sorun: Web `initializeFreeDemoWorkspace` ile Pro trial verir; native uygulamalar şirket dokümanını doğrudan ad alanlarıyla yaratır, callable'ı çağırmaz → mağazadan gelen kullanıcı Free'de kalır ve "14 gün deneme" vaadini görmez.
Kanıt: EGGcraft/AuthViewModel.swift:1158, studioflow-android/.../StudioFlowRepository.kt:208 (yalnızca name/ownerEmail), index.js:9797-9820 (`trialGrantAtSignup` sadece 9878-9975 içinde), web: components/PublicMarketing.tsx:3511; native'de `initializeFreeDemoWorkspace` çağrısı yok.
Kontrol: Native'ler ilk açılışta callable'ı çağırmalı mı, yoksa `beforeUserCreated`/onCreate ile trial verilmeli mi?

**11. [Yüksek] Sunucu/Faturalama · Stripe checkout açıldığı anda deneme hakkı "kullanıldı" sayılıyor**
Sorun: Ödeme sayfasını açıp vazgeçen kullanıcı bir daha deneme alamaz; sonraki checkout'ta hemen ücretlendirilir ("14 gün ücretsiz dediniz").
Kanıt: stripeBilling.js:1541-1545 (`billingTrialUsedAt` session oluşturulunca yazılır), 1524-1529.
Kontrol: Stamp `checkout.session.completed` içinde (applyCompletedSubscriptionCheckout, 986) atılmalı.

**12. [Yüksek] Sunucu · E-posta değiştirince hesap doğrulanmamış olur + 10 gün soğuma → yazım hatasında kilitlenme**
Sorun: Yeni adres yanlış yazıldıysa doğrulama maili gelmez; 3 günden eski hesaplarda web hemen sert kapıya düşer; e-postayı düzeltmek 10 gün engellidir; `accountEmailPrevious` var ama geri alma yolu yok.
Kanıt: index.js:9754 (`emailVerified:false`), 9653 (10 gün), 9722-9724 (cooldown hatası); studioflow-web/components/VerifyEmailGate.tsx:27-33.
Kontrol: "Önceki adrese geri dön" istisnası eklenmeli mi?

**13. [Yüksek] Sunucu · Free/Starter'da Mac/iPhone'dan girilen ödeme kayıtları (`payments`) sessizce kaydedilmiyor**
Sorun: Bu planlarda Swift callable ile kaydeder; `payments` "gelişmiş finans" sayılıp atlanır, `paidAmount` kaydedilir → ledger ile paidAmount tutmaz, giriş bir sonraki snapshot'ta kaybolur. Swift ledger UI'sinde plan kapısı görünmüyor.
Kanıt: index.js:14893 (`SWIFT_ADVANCED_FINANCE_FIELDS` içinde "payments"), 15012-15013, 15100-15101; FirebaseManager.swift:1133-1141; SiparisDetayView.swift:10980-11064.
Kontrol: Ledger Free/Starter'da gösteriliyorsa `payments` allowlist'ten çıkarılmalı (ya da UI kapanmalı).

**14. [Yüksek] Sunucu · Müşteriye giden e-posta/portal/teklif "Bespoke Hand-Painted Dials" imzasıyla gidebiliyor**
Sorun: `appSubtitle` boş kaydedilirse sunucu bu stok sloganı **yazar**; e-posta `businessName`, portal ve teklif sayfası bunu işletme adı olarak gösterir (SMS yolu bilinçli olarak kaçınıyor, e-posta yolu kaçınmıyor).
Kanıt: index.js:8640 (varsayılanı yazar), 26024 (e-posta businessName), 25672 (portal), 26209 (teklif), 25984-25990 (SMS'in bu tuzaktan kaçınma yorumu).
Kontrol: Varsayılanı boş bırakıp `companyData.name` fallback'i kullanmak.

**15. [Yüksek] Sunucu · `deleteWorkspaceData` admin'e açık, geri alınamaz, 60 sn'de yarım kalabilir**
Sorun: Owner olmayan admin tüm sipariş/müşterileri kalıcı siler (çöp yok); büyük alanda sıralı `recursiveDelete` varsayılan 60 sn'de zaman aşımına düşer → yarı silinmiş alan + hata; mesaj "Delete finished" ama notlar/envanter/dosya kütüphanesi/banka kalır.
Kanıt: index.js:11011-11045 (rol `owner||admin`, timeout/memory yok), 10864-10890.
Kontrol: Owner-only + `timeoutSeconds:540` + kapsamın açıkça söylenmesi.

**16. [Yüksek] Sunucu · Admin kapısı `email_verified` bakmadan token e-postasına güveniyor; destek yolu istemci verisine düşüyor**
Sorun: Üç admin e-postasından biri Auth'ta kayıtlı değilse/silinirse, o adresi kaydeden herkes tüm çalışma alanlarının admin panelini görür; `isSupportAdminRequest` token'da e-posta yoksa `request.data.userEmail`'i kabul eder.
Kanıt: index.js:3020, 3041 (`|| request.data?.userEmail`), 3043-3046, 27072/27937/28819 (`token.email` yalnızca).
Kontrol: Üç hesap da kayıtlı+doğrulanmış mı? Custom claim'e geçmek daha güvenli.

**17. [Yüksek] Sunucu · Trial bitince Storage kuralları hâlâ Pro sayıyor; hiçbir iş planı geri yazmıyor**
Sorun: Süresi dolan trial'de callable'lar "Client Files requires Pro" der ama storage.rules ham `billingPlan`'a baktığı için yükleme/okuma devam eder → kayıtsız (orphan) blob'lar ve tutarsız deneyim; istemciler kendi aynalarıyla hesaplamak zorunda.
Kanıt: storage.rules:206-224 (`clientFilesPlanAllowed/messageFilesPlanAllowed` trial'e bakmaz), firestore.rules:110-125 (`trialLapsed` var), index.js:2124-2135, 2235-2239; geri yazan zamanlanmış iş yok (grep `trialHasExpired(` → 2238, 9855 yalnızca).
Kontrol: Saatlik reconcile (stripeBilling.js:2142) `nivadesk_trial`'i de düşürmeli mi?

**18. [Orta] Sunucu · Kısmi "tam düzenleme" isteği parayı sıfırlar**
Sorun: `customerName`/`notes` gibi bir alan tek başına gönderilirse `orderValue`/`paidAmount` 0 olur; yalnızca `deliveryDueDate` eksikse işlem durur. Web bugün hepsini birlikte gönderiyor (OrderDetailContent.tsx:1211-1213), Android/başka istemci için gizli tuzak.
Kanıt: index.js:15329-15352 (`cleanOrderNumber(requestData.orderValue)` undefined→0), 15169-15177 (fullEditFields).
Kontrol: `hasOwnField` ile alan-bazlı patch yapılmalı.

**19. [Orta] Sunucu · Anonimleştirme/müşteri silme/ad senkronu tek batch (500 yazma sınırı)**
Sorun: 500'den fazla siparişi olan müşteride `batch.commit` patlar; müşteri dokümanı zaten anonimleşmiş/silinmiş olduğundan yarı-uygulanmış durum + "internal" hata.
Kanıt: index.js:13996-14025 (anonymize tek batch), 13728-13790, 13645-13720 (chunk yok); karşılaştır 10517 (chunk'lı).
Kontrol: 400'lük chunk'lama.

**20. [Orta] Rules/Sunucu · Team'den düşünce mevcut üyeler tam erişimle kalıyor**
Sorun: Plan Free/Pro'ya inince koltuk limiti 1'e düşer ama üyeler okumaya/yazmaya devam eder; sadece yeni ekleme engellenir. Owner rules üzerinden üye de silemez (hasTeamPlan şartı), yalnızca callable ile.
Kanıt: index.js:16410-16440 (yalnızca ekleme kapısı), firestore.rules:36-43 (`canReadCompany` plan bakmaz), 156-159 (`validTeamWorkspaceUpdate`).
Kontrol: Bilinçli ("veri korunur") mi, yoksa üyeler read-only'ye mi düşmeli?

**21. [Orta] Sunucu · İlk sipariş mesajı ve destek sohbeti bağlamı `orders` koleksiyonunu sorguluyor (gerçek koleksiyon `siparisler`)**
Sorun: "Your first order is organised" satırı hiç çıkmaz; website chat'te `accountOrderCount` hep 0.
Kanıt: index.js:2182-2186, 4551; test yalnızca regex kontrolü (test/qa/first-order-notice.test.js).

**22. [Orta] Sunucu · Cihaz token'ları hiç silinmiyor; `limit(100)` filtresiz**
Sorun: Geçersiz token'lar `enabled:false` ile kalır ve ilk 100'ü doldurur; yeni cihazlar push alamaz.
Kanıt: index.js:374-380 (`limit(100)` sonra bellekte filtre), 430-445 (devre dışı bırakır, silmez), 519-535 (`limit(200)`).

**23. [Orta] Sunucu · SMS, WhatsApp numarasına çalışma alanı varsayılan ülke koduyla gidiyor**
Sorun: 0 ile başlayan yerel numara +44 (ya da ayarlanan kod) alır; yabancı müşteri mesajı almaz, işletme yanlış numaraya SMS ücreti öder.
Kanıt: index.js:25084-25092, 25323, 26000-26010 (`after.whatsappNumber`).
Kontrol: Sipariş/müşteri ülkesi varsa oradan kod türetmek.

**24. [Orta] Sunucu · Pro/Team Mac/iPhone kaydı sunucu alanlarını siliyor (tam doküman değiştirme)**
Sorun: `Siparis.swift` modelinde olmayan `portalLastNotifiedStatus`, `mergedIntoOrderId`, `backupRecordId`, `externalOrderId`, `etsySource` vb. her Mac kaydında kaybolur → durum geri gidince müşteri yeniden mesaj alır, yedek yeniden içe aktarımında kimlik eşleşmesi düşer, entegrasyon bağı kopar.
Kanıt: FirebaseManager.swift:2206 (`setData(from:)`, merge yok), Siparis.swift alan sayımı (portalLastNotifiedStatus/mergedIntoOrderId/backupRecordId/externalOrderId: 0), firestore.rules:236-245 yorumu.
Kontrol: Native'de `merge:true` ya da bilinmeyen alanları koruyan sözlük.

**25. [Orta] Sunucu · Yedek içe aktarma limiti toplam sipariş sayısına bakıyor ("10 AKTİF" kuralına aykırı)**
Sorun: 10 teslim edilmiş siparişi olan Free kullanıcı 1 sipariş bile içe aktaramaz.
Kanıt: index.js:10655-10659 (`usage.orderCount`), karşılaştır 2883-2895 (`activeOrderCount`).

**26. [Orta] Sunucu · `nvCreateFileLink` süresiz, iptalsiz, herkese açık paylaşım**
Sorun: Herhangi bir oturumlu kullanıcı bildiği her Storage URL'si için kalıcı `/f/<id>` linki üretir; süre/iptal yok, dosya silinince kayıt kalır.
Kanıt: index.js:24936-24956, 24958-25000.

**27. [Orta] Sunucu · Doğrulanmamış hesap temizliği yalnızca sipariş/müşteri/üye sayıyor**
Sorun: 30 gün boyunca yeniden giriş yapmayan (token yenileme `lastSignInTime`'ı güncellemez) ama envanter/not/banka/dosya kullanan doğrulanmamış hesap silinir; şirket dokümanı silinir, alt koleksiyonlar/Storage/Stripe kalır.
Kanıt: index.js:11304-11305 (DRY_RUN=false), 11330-11380 (ölçüt), 11385-11392 (`.delete()` recursive değil). Web kapısı yumuşak (VerifyEmailGate.tsx:27-33).
Kontrol: Ölçüte inventoryItems/notes/bankConnections/subscriptions eklenmeli; en azından recursiveDelete.

**28. [Orta] Sunucu · Stripe webhook sıralaması yok**
Sorun: Geciken `customer.subscription.updated` (ör. trialing) daha yeni `active`'in üstüne yazılırsa ledger ve plan eski duruma döner; kullanıcı bir saat sonra reconcile'a kadar yanlış planda kalır.
Kanıt: stripeBilling.js:1176-1207 (yalnızca event id dedupe), 557 (ledger last-writer-wins). verify: `event.created` karşılaştırması yok.

**29. [Orta] Sunucu · Ağır callable'lar varsayılan 60 sn / 256 MB ile tüm siparişleri tarıyor**
Sorun: Büyük alanlarda `exportOrders`, `anonymizeWebCustomer`, `deleteWebCustomer`, `mergeWebCustomers`, `recalculateWorkspacePlanUsage` "deadline-exceeded" verir; export dosyası gelmez.
Kanıt: index.js:9316, 13937, 13889, 14067, 2999 (seçenek yok); karşılaştır 8756-9013 (300 sn/512 MiB).

**30. [Orta] Sunucu · Depolama kotası yalnızca `siparisler.clientFiles` üzerinden hesaplanıyor**
Sorun: Dosya kütüphanesi (`library`), envanter fotoğrafları, mesaj dosyaları, banka fişleri, logo kotaya girmez; kullanıcı "50 MB'ı aştım" uyarısı almadan büyür ya da tersine görünen kullanım gerçekle tutmaz.
Kanıt: index.js:2795-2818, 2822-2836; storage.rules 25-210 MB tekil sınır.

**31. [Orta] Sunucu/Banka · Rıza bitimi için proaktif uyarı yok; "reconnect" durumu 2 başarısızlık (≈16 saat) sonra**
Sorun: 90. günden önce "yenile" bildirimi yok; `data_denied` sınıfı ilk turda "error" kalır, feed sessizce boş kalır.
Kanıt: bankFeed.js:454, 1771 (consentExpiresAt yalnızca yazılır/silinir), 539-545, 720-736 (8 saat, `limit(300)` şirket → 300'den fazla bağlı alanda kalanı hiç senkron olmaz).

**32. [Orta] Sunucu · İstemciler HttpsError kodlarını eşlemiyor; sunucu metinleri İngilizce**
Sorun: 11 dilde çalışan arayüzde limit/rol hataları İngilizce ham metin olarak görünür; yalnızca `reason` (plan_limit_reached vb.) eşleniyor.
Kanıt: web `functions/permission-denied|failed-precondition` eşlemesi 0, Swift 1; index.js:2641 genel mesajı "…to read workspace billing limits." her callable'da; bankFeed.js:1804 bilinmeyeni `internal`+ham mesaj yapar.

**33. [Orta] Sunucu · `requestWorkspaceAccess` e-posta → uid keşfi**
Sorun: Oturumlu herhangi biri e-postanın kayıtlı olup olmadığını ve owner uid'ini (Company ID) öğrenir; Company ID bulgu #1 ile birleşince tehlike büyür.
Kanıt: index.js:16211-16235 (`getUserByEmail`, `ownerEmail` sorgusu).

**34. [Orta] Sunucu · Onarım (`reconcileAcceptedJoinRequests`) koltuk limitine bakmadan üye ekliyor**
Kanıt: index.js:16070-16113 (validateBillingAction yok), 16711-16720.

**35. [Orta] Sunucu · Sipariş limiti işlem dışında sayılıyor (yarış)**
Sorun: Eşzamanlı iki create limiti aşabilir; ayrıca her webhook için tüm siparişler taranıyor (`countActiveOrders`).
Kanıt: index.js:14360-14366 ↔ 14465 (transaction), 2700-2706, 2760-2772.

**36. [Orta] Sunucu · Süresi dolan teklif linkleri silinince sipariş kartı hâlâ "active" gösteriyor**
Kanıt: index.js:26760-26772 (yalnızca link dokümanı silinir), 26232-26236 (`linkState` güncellenmez).

**37. [Orta] Sunucu · Müşteri portalı/teklif için manuel iptal mesajı yanıltıcı**
Sorun: `revokeOrderEstimateLink` sonrası müşteri "This estimate has been replaced by a newer one." görür.
Kanıt: index.js:26265, 26526-26549.

**38. [Orta] Sunucu · `deleteMyAccount` diğer alanlardaki `memberAccess/memberCustomRoles` kalıntısı ve `workspaceAccess`'e bağımlılık**
Kanıt: index.js:29040-29050 (yalnızca memberUids/memberRoles/members), 29036 (üyelikler `workspaceAccess` listesinden; eksikse temizlenmez).

**39. [Orta] Rules · Owner Team planında `members/memberRoles/customRoles`'u istemciden doğrudan yazabiliyor**
Sorun: Koltuk limiti ve rol normalizasyonu atlanır; bir üyeye `role:"owner"` verilirse rules onu yazar sayar.
Kanıt: firestore.rules:156-159, 437-441 (`validTeamWorkspaceUpdate`), canWriteCompanyData 'owner' rolünü kabul eder (45-52).

**40. [Orta] Sunucu · `notifyCustomerOnStatusChange` durum gidip gelince tekrar gönderir; entegrasyon senkronlarından da tetiklenir**
Sorun: A→B→A'da A yeniden mail/SMS; Woo/Shopify/Etsy'nin durum güncellemesi de müşteriye mesaj atar (SMS maliyeti).
Kanıt: index.js:25935-25948 (yalnızca son bildirilen durumla kıyas), bulgu #24 ile birleşince koruma da kaybolur.

**41. [Orta] Sunucu · `sendPushNotificationToCompany` tüm cihazlara gidiyor**
Sorun: Workflow-only/viewer üyeler göremeyecekleri "New website order", teklif kararı, banka uyarısı push'larını alır.
Kanıt: index.js:374-390, 19935-19940, 26290-26300.

**42. [Düşük] Sunucu · `initializeFreeDemoWorkspace` yanıtı `plan:"demo"`, "Free workspace created." derken Pro trial veriyor**
Kanıt: index.js:9975.

**43. [Düşük] Sunucu · Yedek geri alma düz `delete` (estimateRecords alt koleksiyonu kalır), ayar içe aktarımı geri alınamaz (belgeli)**
Kanıt: index.js:10826-10832, 10775-10778.

**44. [Düşük] Sunucu · Teklif imzası işlem öncesi Storage'a yazılıyor; yarışta yetim dosya**
Kanıt: index.js:26660-26680 ↔ 26700-26725.

**45. [Düşük] Sunucu · ZIP indirmede ID token query string'de; hata anında sessizce bozuk zip**
Kanıt: index.js:15856 (`req.query.token`), 15980-15985 (`res.destroy()`).

**46. [Düşük] Sunucu · `recordSiteVisit` oran sınırı yok, 512 MiB geoip örneği**
Kanıt: index.js:26852-26960 (yalnızca bot atlama).

**47. [Düşük] Sunucu · Pro/Team Mac doğrudan `invoiceNumber` yazabilir; sayaç ilerlemez, çakışma mümkün**
Kanıt: index.js:14870 (allowlist'te invoiceNumber), 26774-26800 (sayaç yalnızca callable'da), FirebaseManager.swift:2206.

**48. [Düşük] Rules · Owner şirket dokümanını istemciden silebilir (alt koleksiyonlar/Storage kalır, üyeler kilitlenir)**
Kanıt: firestore.rules:444.

**49. [Düşük] Storage · `support_files/{userId}` herkese okunur/silinir; `client_files`'ta contentType sınırı yok**
Kanıt: storage.rules:246-256, 218-226.

**50. [Düşük] Sunucu · `trackingResults` üye tarafından yazılabilir (joker kural)**
Sorun: Sahte "delivered" kaydı doğrudan siparişi değiştirmez ama yenileme sorgusuna girer.
Kanıt: index.js:248-256, firestore.rules:800-905.

**51. [Düşük] Sunucu · Müşteri birleştirmede ikinci mağazanın `externalCustomerId`'si düşer → sonraki webhook yeni kopya açar**
Kanıt: index.js:14129 (tek id tutulur), 18347-18351 (id ile arama).

**52. [Düşük] Sunucu · `restoreWebOrder` plan kapasitesine bakmaz; `holdIntegrationOrder` bildirimi 24 saatte bir (bilinçli)**
Kanıt: index.js:14787-14819, 2745-2750.

**53. [Düşük] Sunucu · Create-limit hatası "delivered işaretleyince yer açılır" bilgisini vermiyor**
Kanıt: index.js:14365 mesajı ↔ 2758 held-order mesajı.

**54. [Düşük] Sunucu · `purgeDeletedOrders` tüm şirketlerin çöpünü tek seferde, sayfalamasız tarıyor**
Kanıt: index.js:11243.

**Doğrulandı, sorun görülmedi (kısa):** Stripe event-id idempotency (stripeBilling.js:1176); Apple/Google token↔workspace eşlemesi (1656-1700, 2042-2080); cross-rail ikinci abonelik reddi (`refuseSecondTill` 1454); teklif/portal token'ları 24-32 bayt rastgele + sha256 kimlik + IP/token oran sınırı; `postEstimateDecision` idempotent ve hash doğrulamalı; inbound webhook token zorunlu + `held` kuyruğu; Shopify/Woo teslimat-id dedupe; muhasebe fingerprint + inbox `.create()`; settlement eşiği 85/marj 15 ve `unlink` geri alma; `assignInvoiceNumber` transaction; `readBy` iç içe obje (747-780); tüm fonksiyonlar europe-west2; `.env`'de yalnızca fiyat/bayrak adları (değer yazdırılmadı).

Öncelik önerisi: önce #1, #3, #4 (rules, tek deploy), sonra #2 ve #5 (bir satırlık sunucu düzeltmeleri), ardından #8-#11 hesap/plan yaşam döngüsü.


---

# 4) iOS / iPadOS / macOS — SwiftUI uygulaması


Kök: `/Users/gocmen/Developer/studioflow-app/EGGcraft/` (aksi belirtilmedikçe). Sunucu: `/Users/gocmen/Developer/studioflow-app/functions/`, web: `/Users/gocmen/Developer/studioflow-app/studioflow-web/lib/studioflow/`. Salt-okunur inceleme; hiçbir dosya değiştirilmedi, xcodebuild çalıştırılmadı.

### A) Özellik envanteri

**Giriş/kimlik** — `LoginView.swift`: e-posta/şifre, Google, Apple; e-posta doğrulama (OAuth muaf; 3 gün tolerans sonra sert kapı, `AuthViewModel.swift:3620-3640`); `LocalUnlockView` (Face ID/Touch ID), `WorkspaceLoadingView` (Sign Out kaçışı var), onboarding sihirbazı (4 soru, Skip yok), iş-şablonu onboarding'i, çoklu workspace geçişi + katılma isteği (`AuthViewModel.swift:2181, 2560`).

**Sekmeler** (`ContentView.swift:8819-8865` masaüstü, `8472-8557` telefon hamburger menüsü): Home (11 kart/3 boyut), Orders (liste + Trash + `SiparisDetayView` kart çalışma alanı), Dashboard, Bank (Pro+; Overview/Transactions/Recurring/Receipts/Rules), Production, Inventory (kalem/kategori/lokasyon/reçete/sayım/açılış stoğu/fotoğraf/QR etiket), Schedule + Team Schedule, Notes (Keep tarzı + widget), Customers, Files, AI Replies, Messages (Team planı), Settings (Account/Workspace grupları, Plan & Access, Integrations: Etsy/Square/Woo/PayPal; QuickBooks/Xero "planned"), Insights (yalnız 3 sabit e-posta).

**Sipariş detayı kartları**: müşteri, finans (ödeme defteri, iade), fatura kalemleri, kargo/17TRACK, adımlar/durum, malzeme, öncelik, müşteri notları, Schedule & Alerts (yerel bildirim + Apple Reminders/Calendar), geçmiş, Client Files (share extension, kamera, galeri, çevrimdışı kuyruk), To-Do, çalışma süresi, teklif/onay, portal linki, onarım kabul, üretim engeli.

**Platform farkları**: Mac — kart sürükle/yeniden boyutlandır/renk (`SiparisDetayView.swift:14757, 14780` yalnız `!isPhoneLayout`), NSOpenPanel/NSSavePanel PDF-CSV-yedek, ⌘Z/⌘N/⌘S/⌘F/⌘1-5/⌘, (`ContentView.swift:11392-11427`), ilk-proje rehberi, pencere min 900×620. iPhone — tek sütun kart yığını (`phoneKartSirasiJSONV1`, kart düzeni kilitli), context-menu ağırlıklı. iPad — `isPadLayout` ile pinch-zoom canvas (`SiparisDetayView.swift:1434, 3324`); compact size class'ta telefon düzeni. Push yalnız iOS (`EGGcraftApp.swift:97-99, 265-268`). Widget'lar (Net Profit/Aylık/Teslimat/Notes) iOS+Mac; Share Extension yalnız iOS (PDF+görsel).

### B) Bulgular

### Veri kaybı / para

1. **[Kritik] iOS+macOS · Tam-doküman `setData(from:)` sunucu alanlarını siliyor (Sipariş).** Pro/Team doğrudan Firestore'a yazar (`FirebaseManager.swift:1133-1140` → callable yalnız Free/Starter). Yazım noktaları: `FirebaseManager.swift:2093, 2206, 2699, 2741, 2865`. `Siparis.swift` modelinde OLMAYAN, sunucunun yazdığı alanlar: `createdAt, updatedAt, createdByUid, createdByEmail, updatedByUid, updatedByEmail, source` (`functions/index.js:15001-15006, 15069-15077`), `createdByAssignedScope, createdByWorkflowOnly` (`index.js:15091-15097`), `commerce` + `createdAtMs` (`functions/commerce/engine.js:110-131`; web `firestore.ts:2134`), `etsySource` (`functions/etsySync.js:483`), `squareSource` (`functions/squareConnector.js:311`), `portalCreatedAtMs` (`firestore.ts:1970`), `language` (`index.js:17841`), `deletedBy` (uygulamanın kendi yazdığı, `FirebaseManager.swift:2425`); verify: `customerId`, `mergedIntoOrderId`. Kontrol: Pro workspace'te Mac'ten bir not düzenle → web'de Etsy/commerce paneli ve "created" tarihi duruyor mu?

2. **[Kritik] iOS+macOS · Siparişi sadece AÇIP KAPATMAK tam yazım yapıyor.** `SiparisDetayView.swift:2257-2260` `handleOrderDetailDisappear` koşulsuz `updateSiparis(siparis)` çağırıyor; `updateSiparis` değişiklik kontrolü yapmadan `setData` (`FirebaseManager.swift:2196-2211`). Yani 1. maddedeki kayıp için düzenleme bile gerekmiyor; ayrıca her görüntüleme `updatedAt/updatedByUid` değiştiriyor ve web'de eşzamanlı düzenlemeyi eziyor. Kontrol: siparişi aç-kapat, Firestore doküman geçmişine bak.

3. **[Kritik] iOS+macOS · Müşteri tam yazımı.** `FirebaseManager.swift:2489, 2507, 2527, 2871` → `createdAt/updatedAt/createdByUid/updatedByUid` (`index.js:13795+`) silinir; web "key-present" semantiğiyle koruduğu `tags/preferredChannel` gibi alanları uygulama her kayıtta yeniden yazar. Kontrol: Mac'ten telefon düzelt → web müşteri "oluşturulma" sıralaması.

4. **[Kritik] iOS+macOS · UUID olmayan bir iç id tüm siparişi "kurtarma" yoluna atıyor, sonraki kayıt diziyi siliyor.** Web `clientFiles.ts:138-144` `newFileId()` `crypto.randomUUID` yoksa `${Date.now()}-${random}` üretir; `ClientFileItem.id: UUID` (`Siparis.swift`) decode edemez → `decodeSiparisDocument` catch (`FirebaseManager.swift:1526-1528`) → `firestoreArray` `try?` (`1653-1656`) TÜM `clientFiles` dizisini `[]` yapar (`1582`) → 2. maddedeki kayıtla sunucudaki dosya kayıtları silinir. Aynı zincir `historyLog/todoItems/workSessions/payments` için geçerli (`workSessions` id'si istemciden serbest metin: `index.js:13274-13279`). Kullanıcıya yalnız `print` (`1601`). Kontrol: bir siparişe elle `clientFiles[0].id="abc"` yaz, Mac'te aç-kapat.

5. **[Kritik] iOS+macOS · Kurtarma decoder'ı sunucu-alanlarını unutuyor.** `FirebaseManager.swift:1523-1602` catch dalı `estimates, estimateStatus, portalToken/Id/Visibility/AutoUpdates, repairIntake, orderType, productionStageOverride, productionBlocker` atamıyor → bellekteki sipariş `orderType="custom"`, `portalToken=""` olur; sonraki tam yazım bunları sunucudan siler (onarım siparişi "custom"a döner, portal linki ölür). Kontrol: kurtarma yoluna düşen bir siparişi aç-kapat.

6. **[Kritik] iOS+macOS (Free/Starter) · Çevrimdışı kuyruk indirgenmiş modelle replay.** `StudioOfflineSiparisCacheItem` (`FirebaseManager.swift:570-720`) `lineItems, invoiceNote, shipping*, orderType, repairIntake, estimates, portal*, production*, assignedTo, isDeleted` içermiyor; kuyruk bu kopyayı saklıyor (`3040-3065`) ve `cachedOrder.restoredOrder` ile gönderiyor (`3082-3100`). Sonuç: çevrimdışı girilen fatura kalemi/kargo adresi/onarım bilgisi senkronda sessizce kaybolur; `orderType` "custom" olarak GÖNDERİLİR (`index.js:14907` allowlist'te). Kontrol: uçak modunda Starter hesapla onarım siparişine kalem ekle, online ol.

7. **[Yüksek] iOS+macOS · Aynı indirgenmiş cache açılışta listeyi dolduruyor.** `loadOfflineCache` (`2969-2990`) ve müşteri için `721-780` (tags/preferredChannel/company/shipping/source yok). Dinleyici gelmeden düzenlenirse (yavaş ağ, DEBUG Mac `MemoryCacheSettings` `EGGcraftApp.swift:144`) tam yazım sunucu alanlarını siler. Kontrol: açılışın ilk saniyesinde müşteri düzenle.

8. **[Yüksek] iOS+macOS · Son-yazan-kazanır, alan bazlı merge yok.** 0,65 s debounce'lu tam-doküman autosave (`SiparisDetayView.swift:2172-2190`) + 2,5 s "edit grace" sunucu kopyasını yok sayıyor (`FirebaseManager.swift:1447-1455`). Web'de aynı anda girilen ödeme/durum Mac kaydıyla ezilir. Kontrol: web'de ödeme eklerken Mac'te not yaz.

9. **[Yüksek] iOS+macOS · Undo/Redo eski snapshot'ı tam yazıyor.** `restoreSiparis 2865`, `restoreMusteri 2871` → o aradaki sunucu değişiklikleri ve 1. maddedeki alanlar silinir. Kontrol: ⌘Z sonrası web'de `refundedAmount/commerce`.

10. **[Kritik] iOS+macOS · Müşteri silme onaysız, kalıcı ve kaskadlı.** `MusterilerView.swift:250, 473` context-menu → `silMusteri 559` → `deleteMusteri(id:)`; onay diyaloğu yok (dosyada tek `.alert` plan limiti, `199`). `FirebaseManager.swift:2750-2756` dokümanı KALICI siler (müşteri çöp kutusu yok); `silinenMusteriyiSiparislerdenAyir 2707-2745` aynı ADA sahip tüm siparişlerde `customerName="New Project"` yapıp e-posta/WhatsApp/Instagram/adres alanlarını siliyor; eşleşme yalnız trim+lowercase (`2625-2627`) → aynı isimli ikinci müşterinin siparişleri de bozulur. Kontrol: iki "John Smith"ten birini sil.

11. **[Yüksek] iOS+macOS · Siparişte ad değişince müşteri kaydı yeniden adlandırılıyor.** `musteriKontrolVeOlustur 3499-3512`: eski adın başka siparişi yoksa mevcut müşteri kaydının adı/e-postası/telefonu yeni kişiye çevriliyor → eski müşteri kaybolur. Kontrol: tek siparişli "Ayşe"nin siparişine "Mehmet" yaz → Ayşe kaldı mı?

12. **[Yüksek] iOS+macOS · Kayıt hataları sessiz, hayalet kayıt.** `setData(from:)` completion yok (`2093, 2206, 2507`); catch → `print` (`2100, 2211, 2512`); callable hataları `print` (`2118-2121, 2277-2280`), yalnız failed-precondition `planLimitNotice`'a düşer (`2150-2160`). `createSiparisThroughCallable` başarısız olsa da `upsertLocalSiparis` (`2086-2088`) → bir sonraki snapshot'a kadar hayalet sipariş. Kontrol: viewer rolüyle kural reddi UI'da ne gösteriyor?

13. **[Yüksek] iOS+macOS · Çevrimdışı kuyruk kalıcı hatada takılıyor.** `3123-3127` hata → `print` + `return`; `first(where:)` (`3072`) hep aynı öğeyi dener → arkadaki her şey sonsuza dek bekler; kullanıcıya yalnız "Online. Syncing N waiting change(s)" (`2940`). Kontrol: uçak modunda limit-üstü sipariş ekle, online ol.

14. **[Yüksek] iOS · Çift hatırlatma.** `SiparisDetayView.swift:7270-7310` her alarm için yerel `UNCalendarNotificationTrigger`; sunucu `scheduledReminderCheck` (`index.js:17849-17888`) aynı öğe için push üretir → aynı dakikada iki bildirim. Sunucu `notificationSent`'i `customFields.__scheduleAlertItemsV1` içine yazar (`17888`); uygulamanın bayat `customFields` ile tam yazımı bayrağı geri alır → tekrar push. Kontrol: alarm anında telefonda kaç bildirim?

15. **[Orta] iOS+macOS · Para alanı virgül parse'ı.** `customCurrencyValue` (`SiparisDetayView.swift:10928-10936`) ve `Siparis.customRemainingTotal` (`Siparis.swift`, `replacingOccurrences(",", "")`) virgülü SİLİYOR; web/Android "1.250,50" yazarsa 0 okunur, "12,5" → 125. `CurrencyField` (`17598-17660`) `ondalik`'e göre doğru. Kontrol: web `financialRemaining::` değerini hangi formatta yazıyor?

### Çevrimdışı / oturum / cihaz-yerel sızıntı

16. **[Orta] iOS+macOS · Çıkışta yerel veri kalıyor.** `resetForLogout 1277-1297` yalnız belleği temizler; `StudioFlowOfflineCache/<companyId>.json`, `-pending.json`, `PendingClientFiles/` diskte kalır (`2946-2961`). App-Group paylaşım kutusu yalnız içe aktarım sonrası temizleniyor (`SiparisDetayView.swift:9073`), logout'ta değil → A hesabının paylaştığı dosyalar B hesabında "N shared file(s) waiting" (`9571`). Kontrol: A ile paylaş, çık, B ile gir.

17. **[Orta] iOS+macOS · Şifre Keychain'de düz metin.** `LoginView.swift:13-33 LoginCredentialStore` girişte şifreyi saklıyor (`219, 225`), e-posta yazınca otomatik dolduruyor (`234`); silme fonksiyonu yok, logout'ta temizlenmiyor, biyometrik koruma yok, iOS AutoFill by-pass. Kontrol: güvenlik politikası bu mu?

18. **[Orta] iOS+macOS · Çevrimdışı durum yalnız İngilizce metin; kuyruk görünmez.** `offlineStatusMessage` sabit İngilizce (`FirebaseManager.swift:2934-2942`); bekleyen/başarısız öğe listesi, iptal veya yeniden dene yolu yok. Kontrol: kullanıcı takılı öğeyi nerede görür?

19. **[Düşük] iOS · Yerel kilit sessiz by-pass.** `unlockWithDeviceSecurity` `canEvaluatePolicy` başarısızsa (parola yok) kilidi açıyor (`AuthViewModel.swift:1460-1463`). Kontrol: kullanıcıya söyleniyor mu?

### Çökme / kararlılık

20. **[Bilgi] DilMotoru çift anahtar taraması temiz.** 16 tablonun hiçbirinde tablo-içi çift anahtar yok (programatik tarama); 3 çapraz-tablo çakışması son tablo kazanacak şekilde çözülüyor (`DilMotoru.swift:3491-3505`): "Next" `616/1428` (IT "Successivo" vs "Avanti"), "Order" `1568/3362` (PT "Pedido" vs "Encomenda"), "Importing…" ×3. `try!`/`as!`/`fatalError` yok.

21. **[Düşük] iOS+macOS · İndeks/NaN.** `InventoryCategoriesView.swift:241` `?? rows[0]` boş listede çöker; `HomeCardBodies.swift:342` `Double(done.count)/Double(all.count)` tüm adımlar skip'lenince NaN → `HomeProgressBar`. Kontrol: Home kurulum kartında her adımı skip et.

22. **[Yüksek] iOS · Derin iç içe SwiftUI (bilinen).** `ContentView` gövdesi `8905-9378` tek if/else zinciri; `EGGcraftApp.swift:176-178` yorumu "adding to it has crashed on device". Her yeni modifier gerçek iPhone'da stack-overflow regresyon riski. Kontrol: yeni sekme eklerken fiziksel cihazda test.

### Platform farkları

23. **[Yüksek] macOS · Pencere min genişlik çelişkisi.** `ContentView.swift:9374` `.frame(minWidth: 1550, minHeight: 700)` (tüm gövde) vs `EGGcraftApp.swift:244` 900×620. 13" MacBook Air (1470 pt) pencere ekrana sığmaz/kırpılır (App Review 4). Kontrol: 13" Mac'te pencere.

24. **[Yüksek] macOS · Push yok.** `PushNotificationManager` yalnız iOS'ta configure (`EGGcraftApp.swift:97-99, 265-268`) → Mac kullanıcısı mesaj/teslimat/teklif pushlarını almaz. Kontrol: bilinçli mi?

25. **[Orta] macOS · Menü çubuğu komutları yok.** `.commands` hiç yok; kısayollar gizli düğmelerde (`ContentView.swift:11392-11427`) → Edit > Undo bağlı değil, metin alanı odaktayken ⌘Z alanın kendi undo'suna gider. Kontrol: Edit > Undo NivaDesk aksiyonunu geri alıyor mu?

26. **[Orta] iPhone/iPad · Kart düzeni yalnız Mac'te düzenlenebilir.** `SiparisDetayView.swift:14757, 14780` `!isPhoneLayout && !effectiveWorkspaceCardsLocked`; telefon sırası ayrı anahtar (`phoneKartSirasiJSONV1`). iPad regular width'te sürükleme var mı? Kontrol: iPad tam ekran.

27. **[Orta] iPad · Split View'da düzen sıçraması.** `isPhoneLayout = horizontalSizeClass == .compact` (`ContentView.swift:7694`, `SiparisDetayView.swift:1432`) → Slide Over/Split View'a girince anında telefon düzeni; seçili kart/kolon durumu değişir. Kontrol: iPad'de Split View aç-kapat.

28. **[Orta] iOS+macOS · Muhasebe/banka bağlama web'e bağımlı.** QuickBooks/Xero native'de "planned" (`NivaDeskIntegrations.swift:109-111`; web'de canlı); banka "Reconnect" `openURL` ile web'e (`BankSpendingView.swift:1074-1082`). Kontrol: Mac kullanıcısı QuickBooks'u nereden kurar?

29. **[Orta] iOS · Formlar kaydırmayla kapanıyor.** `interactiveDismissDisabled` hiç yok; `InventoryView.swift:242, 249` (açılış stoğu, yeni kalem), mesaj/müşteri formları aşağı çekilince yazılanlar sessizce kaybolur. Kontrol: yeni kalem yazarken sheet'i çek.

30. **[Düşük] macOS · Deprecated API.** `allowedFileTypes` (`AyarlarView.swift:7943`, `ContentView.swift:16053`) → `allowedContentTypes`.

### Plan / satın alma

31. **[Yüksek] iOS+macOS · StoreKit eksikleri.** `Transaction.updates` dinleyicisi yok (yalnız `currentEntitlements` `AuthViewModel.swift:722`); `.pending` (Ask to Buy) sonrası onay uygulamaya düşmez (`655-657`); `transaction.finish()` sunucu doğrulamasından ÖNCE (`649-651`) → `verifyAppleSubscriptionPurchase` ağ hatasında ödeme alınmış ama plan yükselmemiş, kullanıcı "Restore"u bilmezse kilitli; entitlement senkronu yalnız plan ekranı açılınca (`ContentView.swift:13771`). Kontrol: Sandbox'ta doğrulama çağrısını kes.

32. **[Orta] iOS+macOS · Kilitli özellikler gizli, yükseltme yolu zayıf.** Bank ve Messages sekmeleri düşük planda tamamen kaybolur (`ContentView.swift:7737-7744, 7730`); "Upgrade" Settings'te 0, Dashboard'da 4. Kilitli kartlar iyi (`SiparisDetayView.swift:5398-5420`). Kontrol: Free kullanıcı Bank'ı nasıl keşfeder?

33. **[Düşük] · Eski plan adı.** "Upgrade to Lite, Pro or Team" (`SiparisDetayView.swift:5863`) — Starter'a birleştirilmişti. Trial mesajı planı `hasPrefix("team")` ile tahmin ediyor, İngilizce sabit (`FirebaseManager.swift:2131-2137`).

### Kimlik

34. **[Yüksek] iOS+macOS · Giriş ekranında "Şifremi unuttum" yok.** `LoginView.swift` t() listesinde reset yok; tek reset `AuthViewModel.swift:1480` oturum AÇIKKEN `currentUser` e-postasına. Şifresini unutan giremez. Kontrol: giriş ekranı.

35. **[Yüksek] iOS+macOS · Ham Firebase hata metinleri, dil bağımsız.** `AuthViewModel.swift:1063` `errorMessage = error.localizedDescription` (`AuthErrorCode` eşlemesi 0), `LoginView.swift:389-390` gösterir; StoreKit/profil/plan mesajları sabit İngilizce (`AuthViewModel.swift:582-777, 1462-1499`; `FirebaseManager.swift:1067-1081`; `ContentView.swift:14633-14710`). Kontrol: TR'de yanlış şifre mesajı.

36. **[Orta] iOS+macOS · Apple ile girişte ad kaydedilmiyor.** `AuthViewModel.swift:3560` fullName istiyor ama `3569-3581` yalnız identityToken kullanıyor; Apple adı sadece İLK girişte verir → kalıcı isimsiz profil. Kontrol: Apple ile yeni hesap → görünen ad.

37. **[Orta] iOS+macOS · Hesap silme.** `ContentView.swift:15092` `deleteMyAccount`; hata ham (`15096`). Kontrol: sunucu Apple `revokeToken` yapıyor mu (App Store gereği)?

38. **[Orta] · Onboarding'den çıkış yok.** Skip yok (`OnboardingWizardView.swift:14, 1130`), logout düğmesi yok; kayıt hatası (`ContentView.swift:10495-10500`) offline'da sonsuz döngü. Kontrol: uçak modunda yeni hesap.

### Bildirimler

39. **[Yüksek] iOS · İzin bağlamsız isteniyor, red ele alınmıyor.** `NotificationManager.swift:58` workspace hazır olur olmaz `requestNotificationPermission`; `.denied: break` (`157`); hiçbir ekranda "bildirimler kapalı" uyarısı/Ayarlar linki yok (`openSettingsURLString` yalnız Reminders için `ContentView.swift:19183-19191`). Kontrol: ilk açılışta diyalog zamanı.

40. **[Orta] iOS+macOS · Widget yenileme bütçesi.** Her `siparisler` değişiminde (`FirebaseManager.swift:932-937`) `reloadAllTimelines` (`WidgetSummaryBridge.swift:158-160`) → WidgetKit bütçesi tükenir, widget saatlerce bayat (fallback 1 saat, `NivaDeskWidgets.swift:129`). Kontrol: yoğun düzenleme sonrası widget.

41. **[Düşük] · Reminders/Calendar reddi.** `completion(false, nil)` (`ContentView.swift:16733-16748, 16901-16916`) hata nesnesiz → çağıran özel mesaj üretmezse sessiz. Kontrol: izin kapalıyken düğme.

42. **[Düşük] · Üretimde debug telemetri + heartbeat.** `pushDebug/latest` her olayda e-postayla Firestore'a (`NotificationManager.swift:300-331`); 30 sn'de bir `recordSiteVisit` POST, `stop()` hiç çağrılmıyor (`FirebaseManager.swift:6343-6369`). Kontrol: bilinçli mi?

### Yerelleştirme

43. **[Orta] · Sabit İngilizce metinler.** `StudioMessagesView.swift:505-3268` (Team Chat, Conversations, Archived, Pinned/Saved Messages, "This message was deleted", "Replying to…", "Sending...", Direct Message/Private Group, "Workspace Messages"…), `ContentView.swift:729-1209` (Notification Centre, Mark all read, Filters, Clear, "Tap to show N notifications"), `15692-16593` (Role Profiles, Member/View Only/Workflow Only, "Name already used."), `8917` rol mesajı, `AutoReplyView.swift:424-556`, `EGGcraftApp.swift:322, 388` "Sign Out", Share Extension tamamı (`ClientFileShareViewController.swift:18-115`); `keepShortcutText` yalnız TR (`ContentView.swift:2819-2830`). Kontrol: TR'de Messages ekranı.

44. **[Orta] · Çeviri kapsamı.** 3260 anahtar; İngilizce ile birebir kalan: FR 152, DE 144, IT 126, PT 124, ES 122, RU 101, HI 101, JA 99, ZH 97, AR 94, TR 24; TR'de karışık dil (`DilMotoru.swift:1269` "order preview", "workspace"). Kontrol: DE'de 144 İngilizce satır kabul mü?

45. **[Orta] · Çoğul/kalıp.** "change(s)/file(s)" (`FirebaseManager.swift:2934-2940`), "%d file(s)" (`SiparisDetayView.swift:9041`), "Tap to show N notifications" (`ContentView.swift:1209`) — RU/AR çoğul kuralı yok.

46. **[Orta] · Tarih/para yerelleri.** `DateFormatter()` çoğu yerde locale'siz (BankSpendingView 10/8, ContentView 13/8, AyarlarView 10/1); para sembolü hep önek (`DilMotoru.swift:3570-3573`, `SiparisDetayView.swift:15082`) → "12,50 €" yerine "€12,50". Kontrol: DE/PT kullanıcısı.

### Formlar

47. **[Orta] · Sipariş oluşturma çift dokunma.** `yeniSiparisEkle 11658` in-flight guard yok → iki "New Project"; Starter'da limit callable'da geç yakalanır. Kontrol: hızlı çift tık.

48. **[Düşük] · Modelde test verisi varsayılanı.** `companyId = "test_studio_123"` (`Siparis.swift`, `Musteri.swift:6`); yazım guard'ı var (`FirebaseManager.swift:2064`) ama decoder boş companyId'yi `currentCompanyId` ile dolduruyor (`1524-1527`). Kontrol: yanlış workspace'e sızma senaryosu.

### Liste / performans

49. **[Yüksek] iOS+macOS · Her snapshot O(N) üç kez.** `includeMetadataChanges: true` (`FirebaseManager.swift:1439`) → her yerel yazım 2 snapshot; her snapshot TÜM dokümanları decode+sort (`1444-1461`); ardından `saveOfflineCache` tüm listeyi JSON'a encode edip ana thread'de yazar (`1466, 2881-2901, 2992-3009`) ve widget yayını 25 tam tarama (`WidgetSummaryBridge.swift:61-160`). Her tuş vuruşu autosave → 3×O(N) ana thread. Kontrol: 1000+ siparişte not yazarken FPS.

50. **[Orta] · Arama her render'da.** `filteredAndSortedOrders` 6 alan × N `localizedStandardContains` (`ContentView.swift:7835-7856`), debounce/memo yok.

51. **[Orta] · Satır görselleri önbelleksiz.** Liste satırında `AsyncImage` (`ContentView.swift:12649, 12699`), `NSCache/URLCache` özelleştirmesi yok → kaydırdıkça yeniden indirme. Kontrol: Storage indirme sayacı.

### Dosyalar

52. **[Orta] iOS · Kamera izni kontrolü yok.** `ClientFileCameraPicker` (`SiparisDetayView.swift:411-424`) doğrudan `.camera`; `AVCaptureDevice.authorizationStatus` hiç sorgulanmıyor → red durumunda siyah ekran.

53. **[Orta] iOS→web · HEIC ham yükleniyor.** Galeri seçimi veriyi olduğu gibi yazıyor (`SiparisDetayView.swift:9121-9150`, `preferredType` heic); yalnız kamera JPEG (`441`). Web/Android önizleyemez. Kontrol: iPhone galerisinden ekle, web'de aç.

54. **[Orta] · Kabul edilen türler dar.** `FirebaseManager.swift:1829` jpg/jpeg/png/heic/heif/webp/pdf/psd/psb/zip — docx/xlsx/svg/ai/mp4 red; web `CLIENT_FILE_ACCEPT` (`clientFiles.ts:46`) ile hizalanmalı. Share Extension yalnız PDF+görsel (`ClientFileShareViewController.swift:53`). Kontrol: web listesi.

55. **[Düşük] iOS · Share Extension açılışı.** `extensionContext.open("nivadesk://client-files")` + responder-chain hack (`ClientFileShareViewController.swift:101-135`); iOS 18'de güvenilmez. Kontrol: iOS 18 cihaz.

### Erişilebilirlik

56. **[Yüksek] iOS+macOS · Dynamic Type/VoiceOver yok denecek düzeyde.** 2834 sabit `.font(.system(size:` vs 62 semantik font, 3 `dynamicTypeSize`; `accessibilityLabel` toplam ~55 (ContentView 31, SiparisDetayView 6). Kart renkleri anlam taşıyor (`cardColorMeanings`, `SiparisDetayView.swift` 8 kullanım) → yalnız-renk durum. Kontrol: Erişilebilirlik > Daha Büyük Metin ile Orders.

### Tutarlılık / keşfedilebilirlik

57. **[Orta] · Terminoloji.** Sekme "Orders" ama düğme "+ Add Project" (`ContentView.swift:8880`) ve varsayılan ad "New Project" (`Siparis.swift init`, DB'ye İngilizce yazılıyor `FirebaseManager.swift:2712`); "Bank" (`8829`) / `BankSpending` / Home'da "banking"; "AI Replies" vs `QuickReply`. Kontrol: ürün sözlüğü.

58. **[Orta] · Gizli jestler.** Müşteri silme yalnız context-menu/uzun basma (`MusterilerView.swift:250, 473`); `swipeActions` tüm uygulamada 1 (`ContentView`). Kontrol: iPhone'da müşteri silme keşfedilebilir mi?

59. **[Orta] · Home kurulum kartı yanlış "tamam".** `HomeCardBodies.swift:322-324` "Connect your bank" `done: hasFiles || …` — dosya yükleyen herkeste banka bağlı görünür. Kontrol: kopyala-yapıştır hatası mı?

60. **[Düşük] · Undo tutarsızlığı.** Sipariş ekleme geri alınınca Trash (`FirebaseManager.swift:2827`), müşteri ekleme geri alınınca KALICI silme (`2833, 2854`).

61. **[Düşük] · Admin Insights istemci tarafı allowlist.** `ContentView.swift:7726-7729` üç sabit e-posta. Kontrol: sunucu da kısıtlıyor mu?

62. **[Düşük] · Üst şerit yığılması.** E-posta doğrulama şeridi (`EGGcraftApp.swift:196`) + Free/Trial banner (`ContentView.swift:9387, 9714-9736`) + çevrimdışı durum aynı anda; iPhone'da üç şerit. Kontrol: doğrulanmamış Free hesap uçak modunda.

### Öncelik özeti

En acil beş: (2) siparişi aç-kapat = tam yazım → (1)/(4)/(5) ile birleşince Etsy/Square/commerce panelleri, portal linki, client-file kayıtları ve onarım tipi sessizce silinebiliyor; (6) Free/Starter çevrimdışı düzenlemeleri senkronda kayboluyor; (10)/(11) isim tabanlı müşteri eşleme onaysız kalıcı silme ve yeniden adlandırma yapıyor; (13)/(12) hatalar kullanıcıya hiç ulaşmıyor; (23) 13" Mac'te pencere ekrana sığmıyor. Kalıcı çözüm için sipariş/müşteri kayıtlarını alan-bazlı `updateData`/`merge` veya sunucu callable'ına taşımak, `StudioOfflineSiparisCacheItem`'ı `Siparis`'in kendisiyle değiştirmek ve iç id tiplerini `String` yapmak gerekiyor.


---

# 5) ANDROID — Jetpack Compose uygulaması


Kısaltmalar: **A/** = `/Users/gocmen/Developer/studioflow-app/studioflow-android/app/src/main/java/uk/co/eggcraft/studioflow/`, **F/** = `/Users/gocmen/Developer/studioflow-app/functions/`, **M** = `/Users/gocmen/Developer/studioflow-app/studioflow-android/app/src/main/AndroidManifest.xml`, **G** = `.../studioflow-android/app/build.gradle.kts`. Satır numaraları bugünkü çalışma ağacına göredir.

### A) Özellik envanteri

**Bölümler** (A/features/shell/StudioFlowMainScreen.kt:298-330): Home, Orders (+Trash, toplu seçim), Production, Inventory (Items/Categories/Locations/Recipes/Stocktake/Reports/Opening stock/QR etiket), Dashboard, Bank (Pro+; owner veya bankFeed erişimi), Schedule, Team Schedule, Notes (Keep + hatırlatıcılar), Customers, Files (sipariş dosyaları + kütüphane), Messages (**yalnız Team planı**), Quick Reply, Settings (17 alt bölüm: hesap, workspace, plan/Play Billing, team, export, integrations hub, SMS, client domain, admin insights…), Insights (sadece NivaDesk admin). Ek: bildirim çekmecesi, 4 soruluk onboarding, cihaz kilidi (biyometrik niyetli), yardım asistanı, 4 Glance widget, "New note" kısayolu, FCM push.

**Telefon ↔ tablet eşikleri (tutarsız):** üst navigasyon ≥840dp (MainScreen:551), Orders master-detail ≥900dp (OrdersScreen.kt:231), Settings split ≥900dp (SettingsScreen.kt:257), Customers ≥900dp (CustomersScreen.kt:168), Quick Reply ≥900dp, Messages telefon <600dp (MessagesScreen.kt:276), Notes ≥600dp, Schedule masaüstü zaman çizelgesi ≥840dp, Bank compact <700dp (screenWidthDp), sipariş detayı çok sütunlu "board" ≥520dp yalnızca master-detail içinde (OrderDetailScreen.kt:488). 8-10" tablet dikeyde (~800dp) Orders/Settings/Customers **telefon düzeninde** kalır.

**Web/iOS'ta var, Android'de yok:**
1. Banka bağlama/yeniden bağlama (TrueLayer OAuth) — Android tarayıcıya `nivadesk.app/bank` gönderir (A/features/bank/BankSpendingScreen.kt:1454); repo'da yalnız `bankDisconnect` var (A/data/firebase/StudioFlowRepository.kt:1076).
2. QuickBooks / Xero / Pandle muhasebe bağlayıcıları: hub'da "planned / Coming soon" (A/features/settings/IntegrationsHub.kt:167-169); web'de QuickBooks canlı.
3. `/guide` tam kılavuz: Android'de yalnız soru-cevap asistanı (A/features/help/AppHelpAssistant.kt; `askAppAssistant` repo:2118), `getUserGuide` çağrısı yok. `/changelog` yok.
4. Uygulamaya paylaşım hedefi (iOS `ClientFileShareExtension`): M'de `ACTION_SEND` filtresi yok.
5. Derin bağlantılar (`/track/<token>`, `/e/<token>`, `/inventory?item=` QR): M'de `VIEW`/https intent-filter yok → linkler ve QR tarayıcıda açılır.
6. Kamera ile çekim (`TakePicture` yok), çoklu dosya seçimi (`OpenDocument` tekil).
7. Giriş ekranında "Şifremi unuttum" (yalnız Settings:4648).
8. Play aboneliğini yönetme bağlantısı (grep boş).
Android'de olan: CSV export (SettingsScreen.kt:4132), team schedule, admin insights, production, estimate/repair, SMS ayarları, client domain, files kütüphanesi.

**Doğrulanan iyi noktalar:** müşteri kaydı primaryPhone/whatsappNumber/company/shipping* alanlarını her yolda geri gönderiyor (repo:627-651); sipariş yazımları `updateWebOrder` sunucu patch'i üzerinden, `customFields` sunucuda anahtar-anahtar merge (F/index.js:12371-12380, 12852-12853); yıllık Stripe planları `billingPlan: pro_monthly + interval: year` olarak saklanıyor (F/stripeBilling.js:60-73), Android enum'u uyumlu; seçili sipariş/müşteri/thread `rememberSaveable` (OrdersScreen:147, CustomersScreen:148, MessagesScreen:264); Keep-note alan seti web `notes.ts` ile birebir.

### B) Bulgular

### Kritik
1. **[Kritik] Android · Ondalık virgül tutarı 100 kat büyütüyor.** TR/DE klavyede `KeyboardType.Decimal` ayraç olarak "," gösterir; `cleanDecimalInput` yalnız rakam ve "." bırakır, `parseDecimal`/`parseCurrencyLike` virgülü siler → "12,50" → 1250. Paid/Remaining/Base cost/Shipping/Tax alanlarında. Kanıt: A/features/orders/OrderDetailScreen.kt:12092-12110, 12057-12062, 7781-7784 (Decimal klavye), 7343-7487 (alanlar); aynı desen Dashboard:1456/1702, StudioModels.kt:1357. Bank ve Inventory ise virgülü doğru çeviriyor (BankSpendingScreen.kt:2183, InventoryDialogs.kt:78) → tutarsız. Kontrol: Türkçe klavyeyle "12,50" girince Firestore'a ne yazılıyor?
2. **[Kritik] Android · Plan yükseltme ikinci Play aboneliği açıyor.** `purchase()` `SubscriptionUpdateParams` (eski purchaseToken/proration) vermiyor; ürün kimlikleri farklı (`nivadesk_lite`→`nivadesk_pro`) olduğundan Play iki aboneliği birlikte tutar. Sunucu yalnız Stripe/Apple çapraz-ray'ı reddediyor (F/stripeBilling.js:1454-1461). Kanıt: A/billing/StudioGooglePlayBillingManager.kt:205-228. Kontrol: Lite'tan Pro'ya geçen test hesabında Play "Abonelikler"de iki satır var mı?
3. **[Kritik] Android · Bekleyen satın alma sessizce atılıyor, onaylanmamış satın alma yeniden denenmiyor.** `PENDING` (nakit/yavaş kart) → sadece `_isPurchasing=false`, mesaj yok; açılış/onResume'da `queryPurchasesAsync` yok; doğrulama ağ hatasıyla düşerse `acknowledgePurchase` hiç yapılmaz → 3 gün sonra Google iade eder. Kanıt: BillingManager.kt:257-271, 273-292, manuel `restorePurchases` 230-255. Kontrol: verifier hata verdiğinde satın alma nasıl kurtarılıyor?
4. **[Kritik] Android · Sipariş dinleyicisi bir kez hata alınca liste boşalıp ölüyor.** `.catch` içinde `orders = emptyList()` ve yeniden abonelik yok → geçici permission/ağ hatasında kullanıcı "tüm siparişler gitti" görür, uygulamayı kapatana kadar. Kanıt: A/features/shell/StudioFlowViewModel.kt:2103-2108. Kontrol: rol değişimi anında ne oluyor?
5. **[Kritik] Android · Beklenmeyen alan tipi = her açılışta çökme.** `getTimestamp("paymentDate")`, `getLong("deliveryTime")`, `getDate(...)` tip uyuşmazsa RuntimeException fırlatır ve dönüşüm snapshot listener içinde, try'sız çalışır → tek bozuk sipariş/müşteri belgesi (web/yedek import'tan string/number) kalıcı crash döngüsü. Kanıt: A/data/model/StudioModels.kt:1419-1420, 1485, 1567-1576; repo:598-611. Kontrol: verify: `siparisler`'de `paymentDate` string olan belge var mı?
6. **[Kritik] Android · Uygulama kilidi biyometrik hiç çalışmıyor; güvenli kilit yoksa sessizce atlanıyor.** `MainActivity : ComponentActivity` (A/MainActivity.kt:20) → `findActivity() as? FragmentActivity` null → yalnız eski `createConfirmDeviceCredentialIntent`; `isDeviceSecure=false` ise `localUnlockSatisfied=true`. Ekran "fingerprint, face" vaat ediyor. Kanıt: A/features/shell/StudioFlowApp.kt:139-152, 521-523. Kontrol: PIN'siz cihazda kilit ekranı hiç geliyor mu?

### Yüksek
7. **[Yüksek] Android · Şifre sıfırlama girişte yok** → şifresini unutan kilitli kalır. Kanıt: A/features/auth/LoginScreen.kt (Forgot/reset yok); yalnız SettingsScreen.kt:4648.
8. **[Yüksek] Android · Döndürme/katlama/süreç ölümü taslakları siliyor.** OrderDetailScreen 0 `rememberSaveable` / 182 `remember`, 67 `remember(order.id)` taslak; onboarding `step/answers` (A/features/onboarding/OnboardingWizardScreen.kt:272-273); yeni ürün formu (InventoryDialogs.kt:176-178); login formu (LoginScreen.kt:15-22); M'de `configChanges` yok, `resizeableActivity=true`. Kontrol: ödeme tutarı yazarken ekranı çevir.
9. **[Yüksek] Android · Geri tuşu alt sayfadan doğrudan Orders'a zıplıyor.** Toplam 3 BackHandler (MainScreen:334, OrdersScreen:361, MessagesScreen:281); Settings alt sayfası (`selectedKey` SettingsScreen.kt:228), Customers detayı, Notes editörü, Inventory sheet'inde yok. targetSdk 36 → predictive back varsayılan açık, animasyon "uygulama kapanıyor" gösterir. Kontrol: Settings ▸ Plan'da geri.
10. **[Yüksek] Android · Başarısız kayıt yalnızca başlıktaki bulut simgesinde.** `errorMessage` → `HeaderCloudState.Error`; sipariş güncellemesi düşünce dialog/snackbar yok, alan sessizce eski değere döner. Kanıt: MainScreen.kt:2039-2052, VM:440-449; Snackbar yalnız 3 dosyada.
11. **[Yüksek] Android · "Offline mode: değişiklikler bağlantıyı bekler" mesajı yanlış.** Sipariş/müşteri yazımları callable (updateWebOrder) → offline'da hemen hata, kuyruk yok. Kanıt: MainScreen.kt `cloudMessageFor` (Offline metni), repo:866-877, VM:440-449. `hasPendingWrites/isFromCache` hiç kullanılmıyor (grep boş).
12. **[Yüksek] Android · Not hatırlatıcıları Android'de hiç uyarmaz.** AlarmManager/WorkManager/yerel bildirim yok (grep boş); sunucu `scheduledReminderCheck` yalnız sipariş alarmlarını gönderiyor (F/index.js:17815-17870). Kontrol: verify: web/iOS not hatırlatıcısı için yerel bildirim kuruyor mu?
13. **[Yüksek] Android · Ham Firebase/Play mesajları kullanıcıya (91 yer).** `error.message ?: "..."` deseni; FirebaseAuth'un İngilizce/teknik metinleri, Play `debugMessage`. Kanıt: VM:311/331/361, BillingManager:96/131/161, SettingsScreen.kt:5614…9244.
14. **[Yüksek] Android · Çıkışta önbellek ve tercihler kalıyor (hesap sızıntısı).** `clearPersistence/terminate` yok; sadece 2 pref temizleniyor (VM:389-393). Kalanlar: `studio_message_drafts`/`studio_message_local` (VM:136-138), `studio_message_deleted_threads` (MessagesScreen:160), `studioflow_header` (göz/hideNumbers, MainScreen:340), orders tercihleri (OrdersScreen:135), trial/demo/verify banner'ları. Kontrol: ortak cihazda ikinci hesap ilk hesabın mesaj taslağını görüyor mu?
15. **[Yüksek] Android · Onaysız yıkıcı işlemler:** ekip üyesi çıkarma (SettingsScreen.kt:5195-5196), "Delete for everyone" (MessagesScreen.kt:1220), banka kuralı silme (BankSpendingScreen.kt:1078, RuleRow:1743). Tekil sipariş silme çağrısı da doğrudan (OrdersScreen.kt:277-281, 418-422) — verify: satır menüsünde onay var mı?
16. **[Yüksek] Android · Bildirim izni login'den önce, cold start'ta.** Android 13+ iki redde kalıcı kapanır; açıklama yok. Kanıt: A/MainActivity.kt:39, 114-123.
17. **[Yüksek] Android · Tek kanal "Messages" tüm push'lar için; eski marka ve sistem ikonu.** delivery/tracking/estimate/schedule hepsi `studio_messages`; açıklama "StudioFlow workspace messages"; küçük ikon `android.R.drawable.ic_dialog_email` (status bar'da zarf/beyaz kare). Kanıt: A/services/StudioMessagingService.kt:14-15, 64, 76-86.
18. **[Yüksek] Android · Sipariş listesi her satırda tam boyut görseli URL'den decode ediyor, cache yok.** Kaydırmada yeniden indirme, OOM riski; Coil projede var ama bu yollarda kullanılmıyor. Kanıt: A/features/orders/OrdersScreen.kt:1572 (`PreviewBox`) + `URL(previewUrl).openStream()…decodeStream`; aynı desen ScheduleScreen, MainScreen (logo), SettingsScreen, OrderDetailScreen (5 yer).
19. **[Yüksek] Android · Tüm siparişler (çöp dahil) limitsiz tek sorguda bellekte; sipariş detayı 13.858 satır/134 composable, `DetailCard` 666 satır, 97 `forEach`/1 LazyColumn.** Kanıt: repo:590 (`whereEqualTo("companyId")`, limit yok), OrderDetailScreen.kt:8783, 1977, 353. Regresyon ve jank riski.
20. **[Yüksek] Android · Klavye alanları örtüyor; nav bar altında içerik.** `imePadding` yalnız Messages (MessagesScreen.kt:825), `Scaffold` 0, M'de `windowSoftInputMode` yok, targetSdk 36 edge-to-edge zorunlu; `navigationBarsPadding` yalnız 2 ekranda. Kontrol: verify: sipariş detayında en alttaki not alanına odaklan.
21. **[Yüksek] Android · Hesap silme Play aboneliğini iptal etmiyor; yönetim linki de yok.** Kanıt: SettingsScreen.kt:9223-9243 (`deleteMyAccount` + signOut), Play subscriptions linki grep boş. Kontrol: verify: sunucu `deleteMyAccount` Google aboneliğini iptal ediyor mu (hafıza notu: yalnız uyarı)?
22. **[Yüksek] Android · Yerelleştirme boşlukları.** 400/2038 `t()` literal'inin çevirisi yok (ör. "Theme & Branding", "Reply Engine", "Remove VAT?"); 9 çakışan anahtar (+ ile son harita kazanır: Order, Title, Project, Color, Refresh, Email, Inventory, Syncing…, Importing…) (A/language/StudioTranslations.kt:361); ~80 hardcoded metin: Finance "Paid/Remaining/Platform Fee/Shipping Cost" (OrderDetailScreen.kt:7341, 7356, 7458, 7464), kilit ekranı (StudioFlowApp.kt:521-539, 190-195, 225-228), Dashboard menüleri (410/429/448), QuickReply (560-576), Messages "Save/Edit" (1216, 1832), bulk delete metni (OrdersScreen:774).

### Orta
23. **[Orta] Android · 30 sn'lik heartbeat POST arka planda da sürüyor** (`LaunchedEffect(Unit) { while(true) … }` composition yaşadıkça). Kanıt: StudioFlowApp.kt:254-277. Kontrol: verify: Battery Historian'da arka plan ağ.
24. **[Orta] Android · Restore yalnız ilk aboneliği doğruluyor** → plan + depolama eklentisi birlikteyse eklenti geri yüklenmez. Kanıt: BillingManager.kt:239-244.
25. **[Orta] Android · Plan kilidi yalnız Bank (Pro+) ve Messages (Team) için nav'da; diğerleri sunucu hatasına bırakılmış.** Materials kartı, dosya yükleme, team view Free'de görünür, tıklanınca ham "available from NivaDesk Starter" (F/index.js:15236) başlıkta belirir. Kanıt: MainScreen.kt:315-330; `PlanLocked/requiresPlan` grep 0.
26. **[Orta] Android · Numerik/e-posta klavye eksik.** Customers 0 `keyboardOptions` (email/telefon), Settings 0 (Days: 3384/3694/6692), OrderDetail 41 alan/4 klavye; `ImeAction` toplam 3 → form içi Next/Done akışı yok.
27. **[Orta] Android · Sayı/tarih biçimi karışık.** Para `Locale.UK` sabit (CustomersScreen.kt:112, HomeCardBodies.kt:159, OrderDetail `decimalText` 12088) → TR kullanıcıya "1,234.56"; tarih Customers'ta cihaz dili (108-109), Schedule'da uygulama dili (`studioLocale`, 143); tracking tarihi `dd/MM/yy` UK sabit (OrderDetailScreen.kt:11932).
28. **[Orta] Android · Erişilebilirlik.** 244 `contentDescription = null` vs 102 etiketli, 83 IconButton; 26-32dp IconButton'lar (BankSpendingScreen.kt:2121, NotesScreen.kt:386/389/1191/1352, ScheduleScreen.kt:1194-1208); 467 adet 9-11sp yazı, 333 `maxLines=1` → büyük yazı ölçeğinde kırpılma; `semantics` 9 yerde.
29. **[Orta] Android · Dosya yükleme tamamı bellekte, kuyruk yok.** `readBytes()` 10 yerde (ClientFilesScreen.kt:178, MessagesScreen.kt:1446, BankSpendingScreen.kt:335…); WorkManager yok → uygulama kapanınca yükleme kaybolur; HEIC yalnız uzantı olarak kabul, dönüştürme yok (repo `"image/heic"`). Kamera yok, tekil seçim.
30. **[Orta] Android · Üç ayrı PDF çizici** (`createInvoicePdfFile` 12862, `createOrderPdfFile` 13200, `createHistoryLogPdfFile` 12746, OrderDetailScreen.kt) → fatura görünümü tutarsızlaşabilir; web/iOS ile aynı satır kuralı (line-items only) tek yerde değil.
31. **[Orta] Android · Schedule kenar çubuğu genişliği workspace-geneli ayara yazılıyor** (`ordersSidebarWidth` → companySettings) → bir tabletteki sürükleme tüm kullanıcı/cihazları değiştirir. Kanıt: A/features/schedule/ScheduleScreen.kt:209-213. Kontrol: verify: web'de bu ayar kişisel mi?
32. **[Orta] Android · `updateWorkspaceSettings` doğrudan `set(merge)`** — dizi alanlar tamamen değiştirilir, noktalı anahtar literal alan olur (geçmiş readBy hatası). Kanıt: repo:1642-1646. Kontrol: verify: hangi ayarlar dizi (financialExpenseItems, orderCardLabels…)?
33. **[Orta] Android · Her açılışta `users/{uid}` Auth profiliyle eziliyor** (`displayName/photoURL` set merge) → web'de düzenlenen ad eski Auth değerine dönebilir. Kanıt: repo:419-434. Kontrol: verify: web ad değişikliğini Auth'a da yazıyor mu?
34. **[Orta] Android · Push dili sabit "English"** (`deviceTokens.language`). Kanıt: A/services/StudioMessageRouteHolder.kt:161. Kontrol: verify: sunucu token dilini push metni için kullanıyor mu?
35. **[Orta] Android · Schedule hatırlatma push'u siparişe yönlendirmiyor.** Servis yalnız delivery/tracking/estimate_decision rotalıyor; `type=schedule` (F/index.js:17866) uygulamayı açar, siparişe gitmez. Kanıt: StudioMessagingService.kt:46-55.
36. **[Orta] Android · Tablet dialogları.** 58 dialog'dan 5'i `usePlatformDefaultWidth=false`, 6 `widthIn(max)` → tablette dar, telefonda taşan; eşikler (600/700/840/900dp) tutarsız (bkz. envanter).
37. **[Orta] Android · Play Services/App Check yokluğu.** Play Integrity provider (MainActivity.kt:31-36), Google giriş, Billing; enforcement açılırsa custom ROM'da callables düşer; Billing hatası ham `debugMessage` (BillingManager:131). Kontrol: verify: App Check enforcement durumu.
38. **[Orta] Android · İlk açılış offline.** `loadWorkspace` `get().await()` (repo:283-286) → önbellek yoksa hata; VM'de nasıl yüzeye çıktığı belirsiz. Kontrol: verify: uçak modunda ilk açılış "loading"de kalıyor mu?
39. **[Orta] Android · Bildirim geldiğinde aynı thread açık olsa da sistem bildirimi basılıyor; `studio_message_id` extra tüketilmiyor** (mesaja kaydırma yok). Kanıt: StudioMessagingService.kt:26-73, 45; consumer grep 0.
40. **[Orta] Android · FCM token rotasyonu uygulama kapalıyken kaydedilmiyor, eski token belgesi silinmiyor.** Kanıt: StudioMessagingService.kt:19-24 (`currentCompanyId` boşsa atla), RouteHolder:151-182.
41. **[Orta] Android · Bulk seçim ve müşteri paneli gibi `remember` durumları rotasyonda sıfırlanıyor** (OrdersScreen.kt:164, ClientFilesScreen.kt:158-161).

### Düşük
42. **[Düşük] Android · Naif çoğul:** "${n} orders" (OrdersScreen.kt:495, ScheduleScreen.kt:1961/2036, OrderDetailScreen.kt:6879/13408).
43. **[Düşük] Android · RTL:** Arapça destekli ama `LocalLayoutDirection` ayarı yok (grep 0) → uygulama Arapça, cihaz İngilizce ise düzen LTR. Kontrol: verify.
44. **[Düşük] Android · Widget haftası `Calendar.WEEK_OF_YEAR` (cihaz locale) vs Dashboard Pazartesi başlangıcı** → "This Week" farklı çıkabilir. Kanıt: A/widgets/WidgetSummaryBridge.kt:103-105 vs DashboardScreen.kt:1216.
45. **[Düşük] Android · Widget'lar uygulama kilidine rağmen kâr rakamlarını gösterir; `allowBackup=true` ile widget JSON'u ve taslaklar yedeğe gider.** Kanıt: M:8, WidgetSummaryBridge.kt:155-173.
46. **[Düşük] Android · Release'te minify kapalı** (G:43) → büyük APK, obfuscation yok; `credentials 1.2.0-rc01`, `biometric alpha05` (G:79-83, 75).
47. **[Düşük] Android · Giriş/kayıtta Terms/Privacy bağlantısı yok** (LoginScreen grep 0).
48. **[Düşük] Android · Dark tema:** Settings 45 / OrderDetail 31 / Bank 30 hardcoded `Color(0x…)`, QuickReply metin rengi `0xFF8385A8` (561/576); `styles.xml` açık statusBar rengi sabit → dark modda ilk kare beyaz.
49. **[Düşük] Android · Push rotası `availableSections`'ı ilk composition'da kapatıyor** (stale closure) → bölümler değişince rota düşebilir. Kanıt: MainScreen.kt:383-388.
50. **[Düşük] Android · E-posta doğrulama kapısı önbellekli `isEmailVerified`'a bakıyor** → offline'da doğrulanmış kullanıcı 3. günden sonra kapıda kalabilir. Kanıt: LoginScreen.kt:292-300, reload yalnız butonda (343).
51. **[Düşük] Android · Keep-note tam `set()`** (repo:2732): alan seti web ile aynı, ama başka platform yeni alan eklerse Android kaydı siler; `activeEditor*` her kayıtta ezilir. Kontrol: verify.
52. **[Düşük] Android · Dashboard "Time range/Compare/Dashboard cards" ve Messages "edited/Replying to" gibi metinler çevrilmiyor** (22'nin parçası; DashboardScreen.kt:410-448, MessagesScreen.kt:1261/1499).

**Öncelik önerisi:** 1-6 (para/çökme/kilit) → 7-12 (lockout, veri kaybı, ölü liste, hatırlatıcı) → 13-22.


---

# 6) PLATFORMLAR ARASI TUTARLILIK — aynı alanı iki cihazdan kullanınca ne bozuluyor


Yol kısaltmaları (hepsi mutlak): **W** = `/Users/gocmen/Developer/studioflow-app/studioflow-web` · **A** = `/Users/gocmen/Developer/studioflow-app/EGGcraft` (iPhone/iPad/Mac tek kod) · **D** = `/Users/gocmen/Developer/studioflow-app/studioflow-android/app/src/main/java/uk/co/eggcraft/studioflow` · **F** = `/Users/gocmen/Developer/studioflow-app/functions` · **R** = `/Users/gocmen/Developer/studioflow-app/firestore.rules`.
Yöntem: model/kayıt dosyaları tam okundu (Siparis.swift, Musteri.swift, StudioModels.kt, orders.ts/finance.ts/firestore.ts, saveSwiftOrder/createSwiftOrder/createWebOrder/updateWebOrder), üretim kuralı 4 dosyada satır satır karşılaştırıldı; plan, önbellek/bildirim, çeviri ve özellik matrisi için dört paralel salt-okunur tarama koşturuldu (çeviri sayımları TS derleyicisi + amaca yazılmış Swift/Kotlin ayrıştırıcılarla, scratchpad'de). Hiçbir dosya değiştirilmedi.

### A) Parite matrisi

| Özellik | Web | iOS | Mac | Android |
|---|---|---|---|---|
| Home kartları (11 kart/3 boy/sürükle/callable) | tam | tam | tam | tam |
| Orders listesi (10 hızlı filtre, arama, sıralama, toplu iş, çöp) | tam | tam | tam | tam |
| Listeden CSV export | tam | kısmi (yalnız Settings) | kısmi | kısmi |
| Sipariş kartları: repair intake / estimate / stok / iade-banka / ödeme notu / takip / dosya | tam | tam (imza yalnız web sayfasında, tasarım gereği) | tam | tam |
| Kart başlığı yerinde rename | tam (modal) | tam | tam | **yalnız okuma** |
| Kart yerleşim/renk profili + bulut senkron | kısmi (kendi modeli, Swift profillerini okumaz) | tam | tam | tam (settle-gate yok, verify) |
| Production panosu | tam (sürükle) | tam (menü) | tam (menü) | tam (menü) |
| Dashboard finans | tam | tam | tam | tam |
| Banking: bağla (TrueLayer) | tam | kısmi (web'e yönlendirir) | kısmi | kısmi |
| Banking: yönet/split/kurallar/fiş/payout/PayPal/iade/Needs Attention/öneri | tam | tam | tam | tam |
| Banking: toplu inceleme | tam | kısmi (yalnız kural toplu) | kısmi | kısmi (callable sarılı, UI yok) |
| Schedule / team schedule | tam | kısmi (sürükleme yok) | kısmi | tam (DST verify) |
| Notes (paylaşım/hatırlatma) + widget | tam / — | tam / tam | tam / tam | tam / tam |
| Customers: liste/detay/etiket/SMS | tam | tam | tam | tam |
| Customers: merge + anonimleştirme | tam | **yok** | **yok** | **yok** |
| Inventory (8 sekme, foto, QR, rapor) | tam | tam | tam | tam |
| Files kütüphanesi (fileRecords, üç panel) | tam | kısmi (sipariş dosyaları + inbox) | kısmi | kısmi (sipariş bazlı liste) |
| Messages + görüntüleyici | tam | tam | tam | tam |
| AI Quick Replies | tam | kısmi (anahtar testi yok) | kısmi | kısmi |
| Settings bölümleri | 17 | 18 (+Legal) | 18 | 18 |
| Team (davet/rol/koltuk) | tam | kısmi (koltuk web) | kısmi | kısmi (**davet yok**, koltuk web) |
| Plan/faturalama | tam (Stripe + portal) | kısmi (StoreKit, yönet yok) | kısmi | kısmi (Play, yönet yok) |
| exportOrders (4 şablon) / yedek v3 / undo / CSV import | tam / tam / tam / yok | tam / kısmi (istemci-içi import, undo yok) / — / yok | aynı | tam / kısmi (undo yok) / yok |
| Shopify / Woo / Etsy / Square / PayPal | tam | kısmi (Shopify yalnız durum) / tam / tam / tam / tam | aynı | aynı |
| QuickBooks / Xero / Pandle / ChatGPT MCP / web chat | tam / kısmi / tam / tam / tam | yok / yok / yalnız okuma / yok / kısmi (inbox) | aynı | aynı |
| Custom domain / SMS (Twilio) | tam | tam | tam | tam |
| Admin insights / GSC / landing analytics | tam | tam | tam | kısmi (landing yok) |
| Onboarding wizard / ilk-proje rehberi | tam / kısmi (desktop) | tam / **yok** | tam / tam | tam / **yok** |
| Portal & estimate linkleri | tam (render) | link yönetimi | link yönetimi | link yönetimi |
| Widget / quick action | — | tam | kısmi (quick action yok) | tam |
| Gizlilik modu / otomatik kilit / dark mode / RTL | tam / tam / tam / tam | tam / tam / tam / **yok** | aynı | tam / tam / tam / **yok** |
| Bildirim listesi / push | tam / tam | tam / tam | tam / **push yok** | tam / tam |
| Sipariş geçmişi / ayar audit / inbound teslimat günlüğü | tam / tam / tam | tam / yok / yok | aynı | aynı |
| Çöp (30 gün) | tam | tam | tam | tam |

Kanıt (başlıca): 2b `W/app/orders/page.tsx:852` vs `A/AyarlarView.swift:6713`, `D/features/settings/SettingsScreen.kt:4348`; rename `D/features/orders/OrderDetailScreen.kt:211,1233` (blockHeadings yok); merge/anonymize `W/lib/studioflow/customers.ts:141-206` vs A/D'de `mergeWebCustomers|anonymize` grep boş; Files `W/app/files/FilesLibraryView.tsx:15-33` vs `D/features/files/ClientFilesScreen.kt:129-156`; key testi `W/lib/studioflow/quickReply.ts:108` (A/D'de `testQuickReplyApiKey` yok); davet `D`'de `addWorkspaceTeamMember` yok; Mac push `A/EGGcraftApp.swift:285-287`, `A/NotificationManager.swift:228-234`; RTL `W/lib/studioflow/languageDirection.ts:16-18` (A/D'de layoutDirection yok); QuickBooks/Xero/Pandle `A/NivaDeskIntegrations.swift:107-111`, `D/features/settings/IntegrationsHub.kt:167-169` = `planned`.

### B) Alan matrisi özeti

**B1 — Sipariş (`siparisler`)**
- Kim nasıl yazar: Web + Android yalnız callable (`updateWebOrder`/`createWebOrder`, alan-bazlı patch: `W/lib/studioflow/orders.ts:289-309`, `D/data/firebase/StudioFlowRepository.kt:852-880,1556`). Swift: Free/Starter ve kısıtlı rollerde callable (`saveSwiftOrder` allowlist `F/index.js:14853-14905`), **Pro/Team owner/admin/member'da ise merge'siz tam-doküman `setData(from:)`** (`A/FirebaseManager.swift:1133-1140` koşulu; yazımlar `:2093, :2206, :2699, :2741, :2865`).
- Swift tam kaydının **sildiği** alanlar (Siparis.swift:255-346'da yok): `createdAt, updatedAt, createdByUid/Email, updatedByUid/Email, source` (`F/index.js:15070-15079`, `14448-14453`), `createdByWorkflowOnly, createdByAssignedScope` (`14444-14445`), `deletedBy` (`A/FirebaseManager.swift:2425`), **`commerce` damgası + `createdAtMs`** (`F/commerce/engine.js:67-90,110,131`), `etsySource` (`F/etsySync.js:483`), `orderValue` (mağaza-sahipli alan, `F/integrationOrderFields.js:26`), `commerce.reviewRequired` (`F/index.js:31367`).
- Swift **kurtarma decoder'ı** (`A/FirebaseManager.swift:1520-1590`) bellekte şunları düşürür: `orderType`→"custom", `repairIntake`, `estimates`, `estimateStatus`, `portalToken/portalTokenId/portalVisibility/portalAutoUpdates`, `productionStageOverride`, `productionBlocker`; sonraki Mac kaydı bunları Firestore'dan da siler.
- Tip/varsayılan farkları: `deliveryTime` yoksa web 0 → `dueDate=null` (`W/lib/studioflow/firestore.ts:2052-2058`), Swift 45 (`:1520-1545`), Kotlin **1** (`D/data/model/StudioModels.kt:1378-1485` `?: 1`); `courier` web "" vs "Auto Detect"; `paymentMethod` web "" vs "Card"; `riskReason` web "" vs "-"; Kotlin `productionBlocker`'ı iki string'e düzler (atMs/byUid/byName okunmaz); Swift alt-kayıt `id`'leri **UUID tipli** (`A/Siparis.swift:14,26,55,72,84`) — sunucu `crypto.randomUUID()` (`F/index.js:11562,11753,13087,13281`), Android `UUID.randomUUID()` (`D/…/StudioFlowRepository.kt:1389`) uyumlu; `estimates` satırı 20 zorunlu anahtar (`A/Siparis.swift:139-160` ↔ `F/index.js:26108-26131` birebir).
- Sözlükler: status/designStatus ham İngilizce, varsayılan "Not Yet" her yerde; **status havuzu** web/Swift 22 değer (`W/app/settings/page.tsx:1736-1748`, `A/AyarlarView.swift:171`) vs Android 10 değer + `t("Pending")`, `t("Cancelled")` **çevrili** (`D/features/settings/SettingsScreen.kt:936,1012-1019`); `activeStatuses` varsayılanı sunucu/web/Swift 5 (`F/index.js:7356`, `A/AyarlarView.swift:172`, `W/app/orders/OrderDetailContent.tsx:1339`) vs Kotlin 9 (`D/…/StudioModels.kt:607`); ödeme yöntemi Swift `["Deposit","Card","Apple Pay","PayPal","Direct Transfer","Cash","Final"]` (`A/SiparisDetayView.swift:11322`) vs web/Android `["Deposit","Card","Cash","Bank Transfer","PayPal","Apple Pay","Final","Other"]` (`W/…/OrderDetailContent.tsx:6798`, `D/…/OrderDetailScreen.kt:7638`); priority 4'lü aynı; risk Android `None/Waiting/Blocked/Overdue` (`D/…/OrderDetailScreen.kt:12306`, diğerleri verify).

**B2 — Müşteri (`musteriler`)**
- Swift `setData(from: Musteri)` (`A/FirebaseManager.swift:2489,2507,2527,2871`) modelde olmayan sunucu alanlarını siler: `createdAt, updatedAt, createdBy*, updatedBy*` (`F/index.js:13812-13826`), **`anonymizedAt, anonymizedByUid`** (`F/index.js:13979-13981`), **`mergedFromCustomerId`** (`F/index.js:14131`), adres alias'ları `addressLine1/street/town/postcode/zipCode/zip` (`F/index.js:13608-13618`).
- Swift müşteri decode'unda **fallback yok** (`A/FirebaseManager.swift:1683` `catch { return nil }`): `name,email,phone,instagram,address,notes,lastContactDate,profileImageUrl` (`A/Musteri.swift:8-55`) eksik bir belge Mac/iPhone'da görünmez. Sunucu yazıcıları bugün hepsini yazıyor (`F/index.js:13344-13366, 13506-13525, 13812-13826, 18420-18434`) — verify: `18420`'deki `...fields` boş e-posta/telefon anahtarını da yazıyor mu.
- Eşleştirme: sunucu tam ad eşitliği `where("name","==")` (`F/index.js:13326-13330, 13412-13416`) vs Swift trim+lowercase (`A/FirebaseManager.swift:2625-2627, 3484-3500`).
- Android yalnız callable; `tags/prefs` key-present (`D/…/StudioFlowRepository.kt:627-690`). Web callable rebuild: `updateWebCustomer` iletişim alanlarını her kayıtta yeniden kurar (`F/index.js:13530-13607`).

**B3 — `companySettings`**
| Anahtar grubu | Web | Swift | Android | Sunucu doğrulama/audit |
|---|---|---|---|---|
| Finans (`seciliParaBirimi, seciliOndalik, feePercentage, defaultTaxRate, taxCalculationType, taxMilestone*`) | callable `saveFinancialSettings` (`F/index.js:8557-8597`) | **doğrudan merge**, ~60 anahtar tek yazımda (`A/AyarlarView.swift:3595-3640`) | **doğrudan merge** (`D/…/StudioFlowRepository.kt:1641-1645`; anahtarlar `D/…/SettingsScreen.kt:1504-1520`) | yalnız web'de `lastSettingsWriteByUid` + aralık temizliği |
| İş akışı (`activeStatusesJSON, customStepsJSON, customFieldsJSON, customTogglesJSON, financial*ItemsJSON, invLabel*`) | callable `saveWorkspaceBlockHeadings` + doğrudan `setDoc` (`W/…/OrderDetailContent.tsx:4230,5245,8835`) | doğrudan (`A/AyarlarView.swift:3607-3624`, `A/SiparisDetayView.swift:8733,11736,11772`) | doğrudan (`SettingsScreen.kt:1019,1030,7290-7311,7749-7755`; `OrderDetailScreen.kt:476-478,6240-6255`) | sunucu `blockHeadingSettingsFromData` aynı anahtarları okur (`F/index.js:7399-7450`) |
| Dil/tema | kişisel doc (`F/index.js:8599-8625, 8627-8655, 8123-8165`) | kişisel doc + `@AppStorage("seciliDil")` | kişisel doc (`D/…/StudioFlowRepository.kt:1601-1640`) | `savePersonalInterfaceSettings` dil sözlüğünü **doğrulamaz** (`:8136`) |
| PDF bayrakları | shared (`savePdfExportSettings` `:8515-8555`) **ve** kişisel (`:8155-8158`) | shared doğrudan (`A/AyarlarView.swift:3625-3636`) | kişisel (`D/…/StudioFlowRepository.kt:1590-1596`) | iki kaynak, `personalInterfaceSettingsFromData` birleştirir |
| Onboarding (`orderCardLabels, productionStages, onboarding*`) | doğrudan `setDoc` (`W/lib/studioflow/onboardingWizard.ts:440-465`) | doğrudan (`A/ContentView.swift:10470-10495`) | doğrudan (`D/features/onboarding/OnboardingWizard.kt:308-330`) | `productionStages` `saveProductionStages` normalizasyonundan geçmez |
| Kart profilleri (`workspaceUserProfilesJSON, sharedWorkspaceSnapshotJSON, typeWorkspaceSnapshotsJSON`, sipariş `customFields[layout]`) | `saveWorkspaceCardLayout/…Type…/…Order…` (`F/index.js:6797-6908`) | `saveSwiftWorkspaceCardProfile` (`F/index.js:6649-6735`; `A/SiparisDetayView.swift:4291,4320`) | aynı callable (`D/…/StudioFlowRepository.kt:904`) | hepsi `lastSettingsWriteByUid` yazar |
| **Ölü anahtarlar**: `selectedCurrency` (ISO "GBP"), `selectedCountry`, `selectedTimeZone` — üç wizard da yazar (`W/…/onboardingWizard.ts:441-444`, `A/ContentView.swift:10470`, `D/…/OnboardingWizard.kt:308`), **hiçbir okuyucu yok**; para birimi her yerde `seciliParaBirimi` sembolünden okunur (`F/index.js:8430`, `W/lib/studioflow/firestore.ts:1210`, `D/…/StudioFlowRepository.kt:4263`, `A/AyarlarView.swift:3339`). Çift anahtar: `uploadSafety*` + `uploadSafety*V1` (Swift ikisini de yazar `:3627-3630`). |

### C) Bulgular

**[Kritik]**

1. [Kritik] Mac/iPhone↔Sunucu/Web · Swift tam-doküman sipariş kaydı sunucu ve entegrasyon alanlarını siliyor · Pro/Team'de bir owner Mac'te tek alan değiştirince `setData(from:)` belgeyi Siparis modeliyle **değiştirir**; `commerce` damgası (dedupe/stale kontrolü, Channel Details şeridi), `etsySource`, `createdAt/updatedAt/createdBy*`, `source`, `orderValue` kaybolur → web'de kanal şeridi boşalır, Woo/Shopify/Etsy tekrar teslimatı `stamp.lastEventKey/contentHash` olmadığından yeniden uygulanır. Kanıt: `A/FirebaseManager.swift:1133-1140, 2206`; `A/Siparis.swift:255-346` (alan yok); `F/commerce/engine.js:60-64,110,131`; `F/etsySync.js:483`; `W/lib/studioflow/firestore.ts:2130`. Soru: Pro/Team'de de neden `saveSwiftOrder` (alan allowlist) kullanılmıyor, ya da `setData(from:, merge: true)`?
2. [Kritik] Mac↔Hepsi · Müşteri düzenlemesi tüm siparişleri tam kayıtla yeniden yazıyor · Bir müşteri adı/telefonu değişince Swift o müşterinin **her** siparişini `setData(from:)` ile yeniden yazar; #1'deki kayıp sipariş sayısı kadar çoğalır; müşteri silmede de aynı. Kanıt: `A/FirebaseManager.swift:2699, 2741`; karşılığı sunucuda alan-bazlı `syncCustomerContactToOrders` (`F/index.js:13641`). Soru: bu döngü `updateData` ile yalnız iletişim alanlarını yazamaz mı?
3. [Kritik] Mac/iPhone↔Sunucu · Kurtarma decoder'ından geçen sipariş repair/estimate/portal/production alanlarını kaybediyor · Decode hatası olan belge (bir alt-kayıtta eksik zorunlu anahtar, UUID olmayan id, Double `deliveryTime` vb.) 1520-1590'daki fallback'e düşer; `repairIntake`, `estimates`, `portalToken*`, `productionStageOverride/Blocker` bellekte yok; kullanıcı kaydedince Firestore'dan da silinir (müşteri portal linki ve teklif kırılır, onarım siparişi "custom" olur). Kanıt: `A/FirebaseManager.swift:1520-1590` vs `A/Siparis.swift:301-340`; sunucu yazıcıları `F/index.js:12830-12845, 26108-26131, 25876-25879`. Soru: fallback'i tetikleyen gerçek belge var mı (log: "Recovered order document…")?
4. [Kritik] Sunucu/Web-finans↔Swift/Android/Web-sipariş-detayı · Özel "Remaining" toplamı iki farklı kurala göre hesaplanıyor · Sunucu ve web `finance.ts` yalnız siparişin kendi başlık listesindeki `financialRemaining::` anahtarlarını sayar; Swift, Kotlin ve web'in sipariş detayı **tüm** anahtarları sayar. Örnek: paid 500, `orderRemainingItemsJSON=[Balance]`, `financialRemaining::Balance=200`, yetim `financialRemaining::Deposit=100` → sunucu/web-dashboard satış 700, komisyon 21.00, KDV(20%) 116.67; Mac/Android/web-detay satış 800, komisyon 24, KDV 133.33. Kanıt: `F/index.js:11884-11911`; `W/lib/studioflow/finance.ts:30-41`; `W/lib/studioflow/firestore.ts:2066-2071`; `A/Siparis.swift:350-359`; `D/…/StudioModels.kt:1354-1360`. Soru: yetim anahtarlar sayılmalı mı; hangisi doğru?
5. [Kritik] Android-Home↔Android-Dashboard↔Web-detay↔Swift · Aynı sipariş üç farklı "kâr" gösteriyor · Kotlin `netProfit` (özel giderleri ve `financialShowBaseCost`'u bilmez) Home haftalık grafiğinde kullanılıyor; Dashboard `adjustedDashboardNetProfit`; web sipariş detayı tüm `financialExpense::` anahtarlarını sayar ve showBaseCost'u yok sayar. Örnek (satış 1000, maliyet 400, komisyon 30, kargo 20, KDV 100, gider "Stones" 150, showBaseCost=false): Android Home 450 / Android+Swift+Web Dashboard 700 / Web sipariş detayı 300. Kanıt: `D/features/home/HomeCardBodies.kt:1108-1117` + `D/…/StudioModels.kt:1365`; `D/features/dashboard/DashboardScreen.kt:896`; `W/lib/studioflow/firestore.ts:2074-2079,2115` vs `W/lib/studioflow/finance.ts:188-196`; `A/OrderProfit.swift:85-93`. Soru: tek kâr tanımı hangi katmanda yaşamalı?
6. [Kritik] Swift↔Sunucu/Web · Marj (Profit) rejiminde KDV matrahı farklı · Swift `financialShowBaseCost=false` iken alış fiyatını matrahtan düşmez; sunucu ve web her zaman düşer. Örnek: satış 1000, alış 400, komisyon 30, kargo 20, %20: sunucu/web KDV 91.67; Mac 158.33. Kanıt: `A/SiparisDetayView.swift:12857-12861` + `:11354-11356`; `F/index.js:11832-11846`; `W/…/OrderDetailContent.tsx:1609-1613`. Soru: "base cost gizli" muhasebede maliyet yok mu demek?
7. [Kritik] Sunucu↔İstemciler · Negatif özel tutarlar sunucuda 0'a kırpılıyor · `parseFinancialAmountValue → roundMoneyValue` `≤0`'ı 0 yapar; istemciler `-50`'yi olduğu gibi toplar. Örnek: `financialExpense::Credit="-50"` → sunucu komisyon/KDV/kâr 50 farklı. Kanıt: `F/index.js:11800-11804, 11874-11877` vs `A/Siparis.swift:352-355`, `W/lib/studioflow/finance.ts:142-150`, `D/…/StudioModels.kt:1356-1358`. Soru: negatif satır (alacak/indirim) desteklenecek mi?

**[Yüksek]**

8. [Yüksek] Web/Swift/Android wizard↔Hepsi · Onboarding'de seçilen para birimi/ülke/saat dilimi hiçbir yerde uygulanmıyor · Üç wizard da `selectedCurrency:"USD"` gibi ISO kod yazar; okuyucular `seciliParaBirimi` sembolünü okur; ABD'li kullanıcı her yerde "£" görür. Kanıt: `W/lib/studioflow/onboardingWizard.ts:441-444`; `A/ContentView.swift:10470`; `D/…/OnboardingWizard.kt:308`; okuyucular `F/index.js:8430`, `W/lib/studioflow/firestore.ts:1210`, `D/…/StudioFlowRepository.kt:4263`, `A/AyarlarView.swift:3339`. Soru: sembol↔ISO eşlemesi sunucuda mı yapılmalı?
9. [Yüksek] Mac↔Web/Sunucu · Swift `updateSiparisCustomFields` `customFields` haritasının tamamını değiştiriyor · Banka modülünün siparişe yazdığı `financialExpense::<Bank>` değeri ve web'in `orderWorkspaceLayout`/heading JSON'ları, Mac'in bayat haritasıyla ezilir. Kanıt: `A/FirebaseManager.swift:2768-2775`; `F/bankFeed.js:887-905`; `F/index.js:6667-6676`. Soru: nokta-yol `customFields.<key>` güncellemesine geçilebilir mi?
10. [Yüksek] Web↔Swift↔Android · "Delete all data" üç farklı şey yapıyor · Web callable: sert silme + kullanım sayacı + "DELETE DATA"; Android istemci-içi sert silme, sayaç güncellenmez (Free'de limit dolu kalır); Swift siparişleri **Çöp'e** taşır, müşterileri sert siler. Kanıt: `F/index.js:11011-11045`; `D/…/StudioFlowRepository.kt:1917-1935`; `A/AyarlarView.swift:6766-6770` → `A/FirebaseManager.swift:2422-2427`. Soru: hepsi callable'a bağlanmalı mı?
11. [Yüksek] Android↔Web/Swift · Status havuzuna çevrili değer yazılıyor · Türkçe kullanıcı "Bekliyor"/"İptal edildi"yi ham status olarak kaydeder; `activeStatuses.contains("Pending")` eşleşmez, web/Mac bilinmeyen değer görür. Kanıt: `D/features/settings/SettingsScreen.kt:936, 1012-1019`; havuz `W/app/settings/page.tsx:1736-1748` = `A/AyarlarView.swift:171` (22 değer, Android'de "Design"/"Painting" fazladan). Soru: Android havuzu neden ayrı?
12. [Yüksek] Android↔Sunucu · Android `upload_preview_image` diye sunucunun bilmediği bir aksiyonu doğrulatıyor · `BILLING_ACTIONS`'ta yok → `unknown_action` → her planda önizleme görseli yüklemesi reddedilir. Kanıt: `D/…/StudioFlowRepository.kt:1457, 2243-2252`; `F/index.js:2101-2113, 2898-2901`. Soru: cihazda doğrulandı mı?
13. [Yüksek] Web↔Sunucu/Swift/Android · Free planda müşteri limiti yalnız web'de var · Web 10 müşteri sınırı gösterir/uygular; sunucu `customerLimit:null`, Swift nil, Android "Unlimited". Kanıt: `W/lib/studioflow/plans.ts:46`, `W/app/settings/page.tsx:6519`; `F/index.js:1979,13804`; `A/AuthViewModel.swift:298`; `D/…/SettingsScreen.kt:7140-7144`. Soru: hangisi ürün kararı?
14. [Yüksek] Web↔Sunucu/Native · Bilinmeyen/eski plan id'si web'de ücretli, diğerlerinde Free · `teamMonthly/liteLifetime` alias'larını yalnız web ve rules kabul eder; sunucu ve native `demo` sayar → aynı workspace web'de Team, Mac'te Free. Kanıt: `W/lib/studioflow/plans.ts:159-170`; `F/index.js:2115-2119`; `A/AuthViewModel.swift:2869`; `D/…/StudioModels.kt:29-31`; `R:127-137`. Soru: veride bu alias'lar hâlâ var mı?
15. [Yüksek] Swift/Android↔Sunucu/Web · Süresi biten deneme native'de ücretli UI'da kalıyor · Sunucu/web 36 s sonra Free'ye düşer; Swift/Android `billingPlan`'ı olduğu gibi kullanır, her çağrı reddedilir. Kanıt: `F/index.js:2124-2143, 2235-2240`; `W/lib/studioflow/firestore.ts:952-962`; `A/AuthViewModel.swift:2867-2871`; `D/…/StudioFlowRepository.kt:310`. Soru: native'de `trialHasEnded` entitlement'a bağlanmalı mı?
16. [Yüksek] Mac↔Hepsi · macOS hiç push almıyor · APNs/FCM kaydı `#if os(iOS)`; Mac yalnız uygulama içi zil. Kanıt: `A/EGGcraftApp.swift:285-287`; `A/NotificationManager.swift:228-234`. Soru: Mac için bilinçli mi?
17. [Yüksek] Hepsi · Workspace değişince eski workspace'in token satırı kalıyor · Cihaz önceki workspace'in şirket-geneli push'larını almaya devam eder. Kanıt: `W/lib/studioflow/pushNotifications.ts:60-61,97-98`; `A/NotificationManager.swift:59-61,236-290`; `D/services/StudioMessageRouteHolder.kt:23-31`. Soru: switch'te eski `deviceTokens` doc'u silinmeli mi?
18. [Yüksek] Mac/iPhone↔Bulut · Bayat kart profili settle-gate'e rağmen buluta yükleniyor · Boş `workspaceUserProfilesJSON` görülünce yerel @AppStorage JSON'u dinleyici içinde yüklenir; logout `workspaceProfilesJSONV2/workspaceUserProfilesJSONV1`'i temizlemez, workspace switch hiçbir şeyi temizlemez → önceki hesabın profili yeni workspace'e sızar. Kanıt: `A/SiparisDetayView.swift:4110-4121,4145-4191,4241,4277`; `A/AuthViewModel.swift:2495-2515`. Soru: ilk yükleme kapısı bulut boşken de kapalı olmalı mı?
19. [Yüksek] Mac/iPhone↔Web/Android · Çevrimdışı kuyruk tam-sipariş yazımlarını sonradan tekrar oynatıyor · `-pending.json` kuyruğu online olunca `saveSwiftOrder/createSwiftOrder`'ı tüm alanlarla çağırır; arada web/Android'in yaptığı düzenlemeler son-yazan-kazanır ile ezilir. Kanıt: `A/FirebaseManager.swift:3087-3116`, `:2210-2276`. Soru: kuyrukta alan-bazlı fark saklanabilir mi?
20. [Yüksek] Web↔Web(Mac kopyası) · Mac sözlüğü web'in kendi çevirilerini eziyor · `MAC_TRANSLATIONS` tablo birleşiminden sonra merge edildiği için 834 web satırı değişir: Files → "Dosyalardan Seç", Done → "Bitti", Dashboard → "Pano"; kopya Swift'e göre bayat (451 fazla, 1807 eksik, 106 farklı TR). Kanıt: `W/lib/studioflow/language.ts:6139`; `W/lib/studioflow/macTranslations.ts:1255,3468,6148`. Soru: MAC önce mi merge edilmeli / yeniden üretilmeli mi?
21. [Yüksek] Sunucu↔Swift/Kotlin · Sipariş `deliveryTime` yoksa üç farklı teslim tarihi · Web `dueDate=null` ("-", asla geç), Swift 45 gün, Android **1 gün** (ertesi gün geç). Kanıt: `W/lib/studioflow/firestore.ts:2052-2058`; `A/FirebaseManager.swift:1520-1545` (`deliveryTime` `siparisDefaultFieldValues`'da yok → fallback 45); `D/…/StudioModels.kt:1378-1485` (`?: 1`). Soru: alan hangi yazıcıda eksik kalabiliyor (MCP/eski sürüm)?

**[Orta]**

22. [Orta] Web/Android↔Swift/Sunucu · Teslim tarihi aritmetiği DST'de bir gün kayıyor · Web ve Kotlin `paymentDate + N×24h` (ms), Swift takvim günü, sunucu UTC günü. Örnek (Europe/London): 25 Mar 23:30 + 10 gün → web/Android 5 Nis, Mac/sunucu 4 Nis. Ayrıca Android kart yazısı saat-hassas `ceil` (`remainingDays`), filtre gün-başı → aynı cihazda kart "1d late" derken Late listesinde yok. Kanıt: `W/lib/studioflow/firestore.ts:1127-1128,1420-1421,2056-2058`; `A/ContentView.swift:12925`, `19043-19046`; `D/…/StudioModels.kt:1371-1376` vs `D/features/orders/OrdersScreen.kt:2115-2123`; `F/index.js:11708-11726`. Soru: tek "yerel gün" tanımı?
23. [Orta] Swift↔Sunucu · Mac komisyon/KDV'yi yuvarlamadan yazıyor · `paymentFee=(toplam×%)/100`, sunucu 2 hane; "Recalculate" önizlemesi her Mac siparişini değişmiş gösterir; komisyon matrahı da #4'teki filtresiz toplam. Kanıt: `A/SiparisDetayView.swift:12851-12858`; `F/index.js:8672-8680, 11800-11804`; web `W/…/OrderDetailContent.tsx:3895`. Soru: Swift'te de `roundMoneyValue` eşdeğeri?
24. [Orta] Swift↔Sunucu · Mac ayar kaydı ~60 anahtarı doğrulamasız ve audit'siz yazıyor · Tek merge'de finans/iş akışı/PDF/kart bayrakları; `lastSettingsWriteByUid` yok; sunucu aralık temizliği (`cleanPercentageNumber`, 730 gün) atlanır; listener bulut→yerel uyguluyor ama çevrimdışı Mac tekrar açılınca bayat değerleri geri iter. Kanıt: `A/AyarlarView.swift:3595-3640, 3255-3300`; karşılığı `F/index.js:8557-8597`. Soru: audit günlüğü bu yazımları kime atfediyor?
25. [Orta] Android↔Sunucu · Android finans/iş akışı anahtarlarını doğrudan merge ediyor · `settingsUpdatedAt` yazar, `lastSettingsWriteByUid` yazmaz; doğrulama yok. Kanıt: `D/…/StudioFlowRepository.kt:1641-1645`; `D/…/SettingsScreen.kt:1504-1520, 7749-7755`. Soru: `saveFinancialSettings`/`saveWorkspaceBlockHeadings` neden kullanılmıyor?
26. [Orta] Web↔Sunucu · Web de üç yerde `companySettings`'e doğrudan yazıyor · Kart etiketleri, renk anlamları, finans başlıkları; `lastSettingsWriteByUid` var ama sunucu temizliği yok. Kanıt: `W/app/orders/OrderDetailContent.tsx:4230-4234, 5245-5248, 8826-8835`. Soru: tek giriş noktası?
27. [Orta] Android↔Sunucu/Web/Swift · `activeStatuses` varsayılanı Android'de 9, diğerlerinde 5 · `activeStatusesJSON` yoksa Android "Pending/Ready/Design/Painting/Shipped" gösterir. Kanıt: `D/…/StudioModels.kt:607` vs `F/index.js:7356`, `A/AyarlarView.swift:172`, `W/…/OrderDetailContent.tsx:1339`. Soru: sunucu varsayılanı tek kaynak olmalı mı?
28. [Orta] Swift↔Web/Android · Ödeme yöntemi sözlüğü farklı · "Direct Transfer" vs "Bank Transfer", Swift'te "Other" yok → raporlarda iki farklı değer. Kanıt: `A/SiparisDetayView.swift:11322`; `W/…/OrderDetailContent.tsx:6798,6897`; `D/…/OrderDetailScreen.kt:7396,7638`. Soru: ham değer sözlüğü sunucuda sabitlenmeli mi?
29. [Orta] Sunucu↔Swift · Müşteri eşleştirme kuralı farklı · Sunucu tam ad eşitliği, Swift trim+lowercase → "ayşe" / "Ayşe" web'de iki müşteri, Mac'te tek (ve Mac ikinciyi ilkinin adına döndürür). Kanıt: `F/index.js:13326-13330,13412-13416`; `A/FirebaseManager.swift:2625-2627,3491`. Soru: normalize edilmiş `nameKey` alanı?
30. [Orta] Mac↔Web · Anonimleştirme/merge damgaları Mac kaydında siliniyor · `anonymizedAt/anonymizedByUid/mergedFromCustomerId` Musteri modelinde yok; Mac'te kaydedilen anonim müşteri GDPR izini kaybeder. Kanıt: `F/index.js:13979-13981, 14131`; `A/Musteri.swift:4-56`; `A/FirebaseManager.swift:2507`. Soru: `setData(merge:true)` yeterli mi?
31. [Orta] Mac/iPhone↔Sunucu · Müşteri decode'unda fallback yok · Zorunlu anahtarı eksik müşteri sessizce görünmez (siparişte fallback var, müşteride yok). Kanıt: `A/FirebaseManager.swift:1683` vs `:1520`. Soru: entegrasyon müşteri yazıcıları (`F/index.js:18420-18434`) her alanı yazıyor mu?
32. [Orta] Sunucu↔Swift/Android · Free'de sipariş başına 5 görev limiti yalnız sunucuda · Web/Android arayüzde göstermez, ham hata döner; Swift gösterir. Kanıt: `F/index.js:2003, 13065-13068`; `A/SiparisDetayView.swift:5857-5863`; `W/lib/studioflow/plans.ts:22-35`. Soru: web/Android'e limit bilgisi?
33. [Orta] İstemciler↔Sunucu · Banka beslemesi plan kapısı yalnız istemcide · `F/bankFeed.js` ve bank callable'larında plan kontrolü yok (rules yalnız owner). Kanıt: `W/lib/studioflow/plans.ts:66-154`, `A/ContentView.swift:7737-7739`, `D/…/StudioModels.kt:26` vs `F/bankFeed.js` (grep boş). Soru: sunucu tarafı kapı?
34. [Orta] Swift↔Sunucu · Free sipariş limiti Mac'te yerel sayımla, teslim edilenler dahil · Sunucu "aktif" (teslim edilmemiş) sayar; Swift `siparisler.count` → 11. sipariş Mac'te sunucuya sorulmadan reddedilir. Kanıt: `A/ContentView.swift:11660`, `A/AuthViewModel.swift:449-452,2971`; `F/index.js:2763-2777`. Soru: yerel ön-kontrol kaldırılmalı mı?
35. [Orta] Swift · `@AppStorage("studioFlowBillingPlanV1")` iki yerde `.teamMonthly` varsayılıyor · İlk açılışta/temiz kurulumda gelişmiş finans ve kart özelleştirme görünür. Kanıt: `A/DashboardView.swift:136-140`, `A/SiparisDetayView.swift:13774,14040-14041` vs `A/FirebaseManager.swift:1061-1064`. Soru: tek varsayılan `.demo`?
36. [Orta] Web↔Native · Saklanan limit alanlarına yalnız web güveniyor · `billingStorageLimitMB/billingTeamMemberLimit` web'de okunur, sunucu ve native plan sabitini kullanır; elle plan değişikliğinde web 50 MB, Mac 10 GB gösterir. Kanıt: `W/lib/studioflow/firestore.ts:967,1013-1015`; `F/index.js:2324-2332,2838-2841`; `A/AuthViewModel.swift:834-845`; `D/…/StudioModels.kt:173-176`. Soru: alanlar kaldırılmalı mı?
37. [Orta] Sunucu↔Hepsi · Mağaza siparişi push'ları uygulama-içi listeye düşmüyor · Woo/Shopify/Etsy/Square/inbound yalnız push; sabit-id bildirimler (`production_<id>`, `bankSync_<conn>`, `held_integration_orders`) merge ile yeniden yazılınca `readBy` sıfırlanmıyor → ikinci olay "okunmuş" gelir. Kanıt: `F/index.js:19017-19082,19495,19931,30299`; `F/etsySync.js:567,665`; `F/index.js:5975-5989,2743-2755,5706-5719`. Soru: fixed-id'de `readBy` temizlenmeli mi?
38. [Orta] Sunucu↔iOS/Android · Şirket-geneli push'larda `route` yok · Banka/hatırlatma/mağaza push'ına dokunmak uygulamayı sadece açar; web SW `orderId` varsa `/orders`'a gider. Kanıt: `F/index.js:398-411`; `A/NotificationManager.swift:390-402`; `D/services/StudioMessagingService.kt:26-56`; `W/public/firebase-messaging-sw.js:41-56`. Soru: payload'a `route` eklenir mi?
39. [Orta] Mac/iPhone · Production panosu dil anahtarını yanlış okuyor · `@AppStorage("secilenDil")` (typo) → pano hep İngilizce. Kanıt: `A/ProductionView.swift:12` vs `"seciliDil"` (40+ view). Soru: tek satırlık düzeltme.
40. [Orta] Android↔Diğerleri · Android'de ~45 durum/menü kelimesi çevirisiz ve TR sözcük seçimi farklı · "In Progress", "New", "Quoted", "Waiting for *", "Due date", "Export" satırı yok; Done→"Tamam" (diğerleri "Bitti"), Not Yet→"Henüz değil" ("Yapılmadı"), Ready to Ship→"Sevkiyata Hazır" ("Kargoya Hazır"), Schedule→"Takvim" ("Planlama"). Kanıt: `D/language/StudioTranslations.kt:158,1130,1467-1468` vs `A/DilMotoru.swift:93,427-434`, `W/lib/studioflow/macTranslations.ts:3377-3468`. Soru: ortak sözlük üretimi?
41. [Orta] Android↔Sunucu · Android quick-reminder önceliği çevrili yazılıyor · `t("Urgent")` listede; bilinmeyen değer "Normal"a düşer → Türkçe kullanıcı Acil hatırlatma oluşturamaz. Kanıt: `D/…/SettingsScreen.kt:6709, 7484-7490`; `F/index.js:11689-11695`. Soru: ham değer + çeviri ayrımı?
42. [Orta] Sunucu↔Swift/Android · Apple'ın doğrudan `shared_note` bildirimi rules'a takılıyor · `isRead/toUserId` şekli, `recipientUids/readBy` değil; `R:611` istemci yazımını reddeder → Mac/iOS'tan not paylaşımı bildirim üretmez, web/callable yolu üretir. Kanıt: `A/ContentView.swift:3214-3246`; `F/index.js:1289-1330`; `R:609-612`. Soru: bu yol callable'a taşınmalı mı?
43. [Orta] Hepsi · Logout'ta dil/gizlilik/plan önbelleği ve Firestore disk önbelleği kalıyor · Swift `seciliDil`, `hideSensitiveNumbers`, `studioFlowBillingPlanV1` ve aynalanan companySettings anahtarları; web `persistentLocalCache` ve Android SDK önbelleği hiç temizlenmiyor; sonraki hesap ilk saniyelerde önceki verileri görebilir. Kanıt: `A/AuthViewModel.swift:2454-2516`; `A/FirebaseManager.swift:1359-1371`; `W/lib/firebase/client.ts:66-70`; `D/features/shell/StudioFlowViewModel.kt:388-408`. Soru: paylaşımlı cihaz senaryosu hedefleniyor mu?
44. [Orta] Sunucu↔Sunucu · `selectedLanguage` iki yazıcıda farklı sertlikte · `saveLanguageSettings` sözlük doğrular, `savePersonalInterfaceSettings` 80 karaktere kadar her şeyi kabul eder; web/Swift bilinmeyen değerde sessizce İngilizce, Android normalize etmeye çalışır. Kanıt: `F/index.js:8615, 8136`; `W/…/language.ts:6402-6405`; `A/DilMotoru.swift:3564`; `D/…/StudioTranslations.kt:58-75`. Soru: tek temizleyici?

**[Düşük]**

45. [Düşük] Web↔Swift/Android · Üretim aşaması id üretimi 40 karakterde ayrışıyor · Web `slugifyStageId` 40'a kırpar ve başlığı temizler; Swift/Kotlin kırpmaz → uzun başlıklı lane için `productionStageOverride` native'de eşleşmez. Geri kalan kural dört dosyada birebir. Kanıt: `W/lib/studioflow/production.ts:56-62,79`; `A/ProductionModels.swift:39-46`; `D/features/production/ProductionRules.kt:93-97`; `F/production.js:153-215`. Soru: 40 sınırı sunucuya taşınsın mı?
46. [Düşük] Swift↔Web/Android · designStatus "Cancelled" olunca Swift `status`'ü de iptal ediyor, diğerleri etmiyor. Kanıt: `A/SiparisDetayView.swift:11781`; `F/index.js:15296-15304` (böyle bir kural yok). Soru: sunucu kuralı mı olmalı?
47. [Düşük] Swift↔Sunucu · Çöpten geri alma `deletedBy`'ı bırakıyor · Sunucu üç alanı temizler, Swift ikisini. Kanıt: `A/FirebaseManager.swift:2442-2447`; `F/index.js:14805-14809`. Soru: Swift restore callable'a geçsin mi?
48. [Düşük] Android · Dashboard gider anahtarını `financialExpense::<id>` ile de arıyor, kimse id ile yazmıyor. Kanıt: `D/features/dashboard/DashboardScreen.kt:1454-1455,1700-1701`. Soru: ölü kod mu?
49. [Düşük] Android · `"Syncing…"` anahtarı `TR_COMMERCE`'de iki kez, son değer kazanıyor (Mac'te çöktüren aynı kopya). Kanıt: `D/language/StudioTranslations.kt:447,492`. Soru: Kotlin tarafında duplicate lint?
50. [Düşük] Hepsi · "Lite" kalıntıları · Public FAQ JSON-LD, web kart mesajı, Swift plan metinleri; Free purchase model Android'de "Demo". Kanıt: `W/lib/publicSite/structuredData.tsx:89,114`; `W/lib/studioflow/cardLayouts.ts:357`; `A/SiparisDetayView.swift:2346,5863`; `D/…/SettingsScreen.kt:7090`. Soru: toplu metin taraması?
51. [Düşük] Sunucu↔Web/Swift/Android · Shopify Billing `billingInterval/billingCurrentPeriodEnd` yazmıyor · "Renews on" boş, Swift interval nil, Android tüm satırları güncel sayar. Kanıt: `F/index.js:29312-29349`; `W/app/settings/page.tsx:6549`; `A/AuthViewModel.swift:2873-2874`; `D/…/SettingsScreen.kt:4751-4752`. Soru: Shopify webhook'unda dönem alanı var mı?
52. [Düşük/verify] Web↔Android · Notlar: Android `set()` merge'siz, sabit anahtar listesi; Swift `companyId` yazıyor, Android yazmıyor → Android düzenlemesi `companyId`'yi düşürür (paylaşımlı sorgular buna dayanıyorsa kırılır). Kanıt: `D/…/StudioFlowRepository.kt:2696-2737`; `A/ContentView.swift:3105-3130`; `W/lib/studioflow/notes.ts:147-181`. Soru: `personal_notes` sorguları `companyId` filtreliyor mu?
53. [Düşük/verify] Web · `uploadSafety*` ve `*V1` çift anahtarı: Swift ikisini de yazar, sunucu hangisini okuyor? Kanıt: `A/AyarlarView.swift:3627-3630`; `F/index.js:9517` (`saveUploadSafetySettings`). Soru: V1 kaldırılabilir mi?

Kısa özet: en yüksek riskli grup Mac/iPhone'un Pro/Team'de merge'siz tam-doküman yazımı (#1-3, #9, #19) ve para hesaplarında dört farklı toplama/matrah kuralı (#4-7, #23); ardından hiç uygulanmayan wizard para birimi (#8), Android'in çevrili status/priority değerlerini ham saklaması (#11, #41) ve plan kapılarının platformlar arasında dağınık olması (#12-15, #32-36).
