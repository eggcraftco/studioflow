# Admin Insights — derin inceleme, yeniden tasarım ve canlı üyeler (29 Ekim 2026)

Sahibin isteği: yalnız adminlerin gördüğü Insights alanını derinlemesine incelemek, görsel ve kullanılabilirlik olarak düzenlemek, işe yarar eksik özellikleri eklemek; özellikle **şu an uygulamada olan üyeleri ve hangi uygulamadan bağlandıklarını canlı** görmek.

Durum: **hepsi yayınsız**, toplu yayın trenine hazır.
- Web: dal `claude/admin-insights-2026-10-29-b0a8c6` (canlı web tabanı `hostinger/main` = 10f2b8db üstünde).
- Sunucu: `~/Developer/nivadesk-deploy-2026-10-29/insights/` (README, `verify-tree.py`, `readback.py before|after`, kilitli `deploy-commands.sh`, `rollback-commands.sh`).
- Native: `studioflow-app` dalı `insights-native-2026-10-29` (2.4 adayı, `sec-fix-native-2026-10-28` üstünde).

---

## 1. Kısa sonuç

1. **Canlı üye sinyali zaten vardı ama kör ve kirliydi.** Web, iOS, macOS ve Android her açık oturumda `recordSiteVisit`'e anonim bir "app" heartbeat'i atıyor; `appPresence/{oturum}` belgesi yazılıyor. Genel Bakış'taki "In App Now" bunu sayıyordu. Ama sinyal kimin olduğunu, iPhone mu iPad mi, hangi sürüm olduğunu taşımıyordu, 15 dakikada siliniyordu (geçmiş yok) ve personel/test hesaplarını ayıramıyordu. Canlı loglara göre son 7 günde ~13.000 native heartbeat'in ~7.300'ü tek bir Mac'ten (2.2, build 32, Darwin 27), yani büyük ihtimalle sahibin arka planda açık Mac uygulamasından geliyor (yalnız user-agent sayıldı, IP okunmadı). "In App Now" bu yüzden çoğu zaman sahibin kendisini gösteriyordu.
2. **Yeni Live sayfası** bu sinyali **yeni bir Firestore yazması eklemeden** zenginleştiriyor: aynı tek belge yazımına cihaz, sürüm/build, etkin olunan saat ve (yeni uygulamalarda) doğrulanmış oturum kimliği ekleniyor. Live şunu gösteriyor: şu an uygulamadaki kişi sayısı, uygulama başına (Web, iOS, iPadOS, macOS, Android), sürümler, cihaz/sistem, son 24 saat (saatlik), son 7 gün (günlük), DAU/WAU/MAU ve DAU/MAU oranı. Personel ve test hesapları iş görünümünde dışarıda.
3. **Insights'ın kendisi** 14 düz bağlantıdan 5 gruba (Pulse, Money, Customers, Product, Website) toplandı; bölüm adres çubuğunda (geri tuşu çalışıyor), telefonda açılır menü; koyu tema renk hataları, erişilebilirlik eksikleri, "bilinmeyen = 0" gösterimi, sahte canlı çubuklar ve özel tarih çökmesi düzeltildi; CSV dışa aktarma eklendi.

---

## 2. İnceleme bulguları

Kaynaklar: canlı web kodu (10f2b8db), her callable'ın **kendi** canlı kaynak arşivi (gcf-v2-sources; `getAdminInsights` 15 Eki, `getSitePresence` 6 Eyl, `recordSiteVisit` 29 Eki 12:46Z SEC-FIX, `getActivationFunnel` 15 Eki 11:37Z), canlı istek loglarındaki user-agent sayımları (IP okunmadı) ve demo-insights emülatöründe ekran. Her callable sunucuda `email_verified` + `SUPPORT_ADMIN_EMAILS` kontrolü yapıyor (16'sı okundu). `listFeedback`/`getFeedbackDetail`/`updateFeedbackStatus` bu arşivlerde yok; okunmadı.

İşaretler: **[hata]** yanlış sayı/çökme · **[yanıltıcı]** sayı doğru ama etiket/tanım yanlış anlaşılıyor · **[perf]** pahalı/sınırsız sorgu · **[ux]** · **[koyu]** koyu tema · **[a11y]** · **[mobil]**. "✔" = bu pakette düzeltildi.

### 2.1 Tüm alan
| Bulgu | Durum |
|---|---|
| [ux] 14 düz bağlantı, grup yok; bölüm adreste yok (geri tuşu Insights'tan çıkıyordu, bağlantı paylaşılamıyordu) | ✔ 5 grup, `#live` gibi adres, geri/ileri çalışıyor |
| [mobil] 980 px altında 14 düğmelik yatay şerit, kaydırma ipucu yok | ✔ telefonda "Section" açılır menüsü (gruplu) |
| [a11y] Kenar çubuğu `nav` değil, `aria-current` yok | ✔ `nav` + `aria-current="page"` |
| [koyu] `rgba(17,24,39,…)` sabit gri: koyu temada çipler/izler kayboluyordu; `InfoTile` satır içi arka planı koyu tema stilini eziyordu | ✔ hepsi tema değişkeni (`--admin-*`), 0 kalan |
| [a11y] Plan renkleri metin olarak kontrast sınırının altında (#30d158 beyazda ~1.9:1, #ff9f0a ~2.0:1) | ✔ metin için tema başına koyu/açık plan renkleri; grafik dolguları aynı |
| [a11y] Değişim rozetleri: düşüş ekran okuyucuda "12.5%" (işaret yalnız okta) | ✔ metinde "+"/"−", sıralama rozetinde "up/down" |
| [a11y] Aralık çiplerinde `aria-pressed` yok; tarih etiketleri alanlara bağlı değil | ✔ |
| [ux] Yükleniyor/hata metinleri duyurulmuyor | ✔ `role=status/alert` (yeni ve değişen yerlerde) |
| [ux] Hiçbir sayfada CSV yok | ✔ Live (saatlik+günlük), Global Statistics (günler), Activation (çalışma alanları); hücreler formül enjeksiyonuna karşı korumalı |

### 2.2 Overview (`getAdminInsights`)
| Bulgu | Durum |
|---|---|
| [yanıltıcı] "In App Now" ham oturum sayısı: personel ve test oturumları dahil, bir kişinin iki sekmesi iki sayılıyor | ✔ Live ile aynı kaynaktan "In the apps now" (kişi, uygulama başına), tıklayınca Live |
| [yanıltıcı] "Total Users" her Auth hesabı (personel, mağaza inceleme hesapları dahil) ama "Business view: N left out" notunun altında | ✔ etiket "Sign-in accounts … staff and test included". Sayının kendisini süzmek sunucu işi → §5 sonraki adım |
| [hata] Sayılamayan değerler (`null`) ekranda 0 (`?? 0`) | ✔ "—" |
| [yanıltıcı] "Feature Usage" listesinde toplamı anlamsız bir % sütunu | ✔ % kaldırıldı, düz sayı listesi |
| [yanıltıcı] "Requiring attention" deneme ve manuel planları "paid" diye anlatıyordu | ✔ metin düzeltildi |
| [yanıltıcı] "Active Workspaces" = son 30 günde sipariş oluşan (mağaza içe aktarımı da sayılıyor) | ✔ etiket "Workspaces with a new order … shop imports included" |
| [ux] Yenileme düğmesi ve "üretildi" saati yalnız metinde | ✔ "Updated hh:mm" + Refresh + "Try again"; iskelet yükleme |
| [perf] Her açılışta 50.000 nota kadar collection-group taraması, `listUsers`, işaretli her alan için sıralı `count()` | açık — §5 |

### 2.3 Diğer bölümler (kod okuması; ekranda yalnız Overview, Live, Global Statistics gezildi)
| Bölüm | Bulgu | Durum |
|---|---|---|
| Users & Workspaces | [yanıltıcı] "Active 7d/30d" `lastSignInTime` kullanıyor — oturumu açık kalan (yeniden giriş yapmayan) üye hiç aktif sayılmıyor | açık; Live'daki DAU/WAU/MAU `lastRefreshTime` kullanıyor (doğrusu). §5 |
| Users & Workspaces | [yanıltıcı] Kullanıcı sayıları görünüm anahtarını yok sayıyor; "ort. alan/kullanıcı" süzülmüş alanı tüm hesaplara bölüyor | açık |
| Subscriptions / Revenue | [yanıltıcı] "paid" ve ARPU denemeleri ve manuel planları içeriyor; Revenue (taban+koltuk+depolama) ile Overview (yalnız taban) iki farklı "£/ay" | açık; Overview zaten "List-price potential … not revenue" diyor |
| Subscriptions | [yanıltıcı] Shopify faturalı alanlar £ liste fiyatıyla, Shopify USD alıyor | açık |
| Feature Usage | [perf] Açılış başına ~100.000'e varan okuma (not taraması + 20.000 sipariş/müşteri) | açık |
| Storage | [perf] 20.000 siparişe kadar dosya listeleriyle okuma, sınır sessiz | açık |
| User Lookup | [ux] Arama kutusu/işaret menüsü etiketsiz; işaret menüsü mevcut işareti göstermiyor | açık |
| Global Statistics | [hata] Özel tarih alanı boşaltılınca sayfa çöküyordu (Invalid Date → `toISOString`) | ✔ ekranda doğrulandı (alan boşken 30 güne düşüyor, konsolda hata yok) |
| Global Statistics | [hata] "Bugün" UTC'ye göre; sunucu İngiltere gününe göre kaydediyor | ✔ |
| Global Statistics | [yanıltıcı] "On Site Now" kartındaki çubuklar veri değil, sinüs süslemesi; çağrı başarısızken de "Live" | ✔ kaldırıldı; "Not updating" durumu |
| Global Statistics | [yanıltıcı] "Total Visitors" sekme başına oturum | ✔ "Visitor sessions" + açıklama |
| Global Statistics / Landing | [yanıltıcı] Admin tarayıcıları ziyaretçi sayılıyordu (opt-out yalnız Landing sayfası açılınca kuruluyordu, site beacon'ı ona bakmıyordu) | ✔ Insights açılınca opt-out kurulur; site beacon'ı ona uyar |
| Global Statistics | Artık "Support inbox" kartı | ✔ kaldırıldı |
| Google Search | [ux] Her hata "Search Console'u bağla" kartını gösteriyor; [yanıltıcı] ortalama sıra çizgisi ters | açık |
| Activation | Canlı sürüm (15 Eki 11:37Z ayrı yayın) görünüm/işaret, banka eşleşmeleri ve bağlantıları okuyor. [perf] sırasız `companies.limit(500)` + alan başına ~12 sorgu; 500'ü geçince bazı alanlar sessizce dışarıda | ✔ CSV; perf açık |
| Customer Feedback | Filtre, yenileme, "load more" var; tarih aralığı/CSV yok | açık |

### 2.4 Test hesaplarının dışarıda kalması (`analyticsExclusions`)
- İş görünümü yalnız **çalışma alanı** işaretleriyle süzüyor (`internal`/`qa`/`pilot`, ada göre hiçbir şey dışlanmıyor). Çalışma alanı, plan, sipariş/müşteri sayıları ve Activation buna uyuyor.
- Uymayanlar: tüm **kullanıcı** sayıları, mesaj/hatırlatıcı/bilet sayıları, ChatGPT, "son sipariş" saati ve — bu pakete kadar — tüm canlı sayaçlar.
- Bu pakette: Live ve DAU/WAU/MAU, işaretli alanların üyelerini (`users/{uid}.activeCompanyId`) ve NivaDesk personelini (doğrulanmış admin e-postası) iş görünümünde dışarıda bırakıyor ve kaç oturum/hesap bırakıldığını yazıyor; QA görünümü hepsini sayıyor.

---

## 3. Rakip karşılaştırması

Bakılanlar: ChartMogul, Baremetrics, ProfitWell (Paddle), Stripe Billing analytics, Mixpanel, PostHog, Amplitude, Intercom raporları, GA4 Realtime / Firebase, RevenueCat (vendor dokümanları, 29 Eki).

| Özellik | Kimde | NivaDesk (önce → şimdi) |
|---|---|---|
| Canlı aktif kullanıcı, platform/cihaz/sürüm dağılımı | GA4 Realtime (son 30/5 dk, dakika çubukları, appVersion/platform/deviceCategory), Firebase (son 30 dk, sürüm benimseme), PostHog Live, Intercom | ham oturum → **Live: kişi, uygulama, sürüm, cihaz, 24 saat/7 gün** |
| DAU/WAU/MAU, DAU/MAU | Mixpanel, PostHog, Amplitude, Firebase/GA4 | yok → **var (kayan 1/7/30 gün)** |
| Sürüm benimseme (mağaza aşamalı yayınlarından sonra) | Firebase "Latest release", GA4 | yok → **canlı sürüm tablosu** (2.3 = build 33 eski uygulamalardan da) |
| Önceki döneme göre karşılaştırma | Stripe, Mixpanel, PostHog, Amplitude, Intercom, GA4 | yalnız Global Statistics ve Google Search'te → aynı (§5) |
| CSV dışa aktarma | neredeyse hepsi | yok → **3 tabloda** |
| Sayıdan müşterilere inme (drill-down) | Stripe Explore, Intercom çekmecesi, ChartMogul | Lookup ayrı → Overview kutularından bölümlere geçiş; tam drill-down §5 |
| MRR + hareketleri (yeni/genişleme/daralma/kayıp/geri dönüş) | ChartMogul, Baremetrics, ProfitWell, Stripe, RevenueCat | yok — ödeme defteri okunmuyor ("Collected revenue: Not measured") → §5 |
| Deneme→ücretli dönüşüm | ChartMogul, Baremetrics, Stripe, RevenueCat | yok → §5 |
| Başarısız ödeme / tahsilat | Baremetrics, ProfitWell, (Stripe) | yalnız "payment failed" sayısı → §5 |
| Yaşam döngüsü (yeni/dönen/canlanan/uykuda) | PostHog, Amplitude, (Mixpanel) | Activation'da durum dağılımı var |
| Uyarılar (yeni ödeme, iptal, başarısız ödeme) | Baremetrics (Slack), Mixpanel, PostHog, Amplitude | yok → §5 |
| Notlar/annotations (sürüm, fiyat, kampanya) | Baremetrics, Mixpanel, PostHog, Amplitude | yok → §5 |

Bu ölçekte (yüzün altında çalışma alanı) **anlamsız** olanlar ve eklenmeyenler: istatistiksel anomali tespiti, aylık kohort tutundurma ızgarası (hücre başına 3–5 alan), LTV = ARPU ÷ churn (churn sıfırken tanımsız), quick ratio, sektör kıyası. Oranlar küçük tabanda yanıltır; sayı + "x / y" gösterilmeli.

Tanımlar (etiketler sektörle uyumlu olsun diye): DAU/WAU/MAU kayan 24 saat / 7 gün / 30 gün (Mixpanel, PostHog, Firebase); "DAU/MAU" oranı GA4'teki stickiness; canlı penceresi GA4'te 30 ve 5 dk — NivaDesk'te sunucu penceresi 2 dk (heartbeat 90 sn), ekranda "last 2 minutes" yazıyor; bir üye iki uygulamadaysa toplamda bir kez, uygulama satırlarında ikisinde (Mixpanel'in segment toplamı notu gibi), ekranda yazılı.

---

## 4. Yapılanlar

### 4.1 Live sayfası (yeni) ve canlı üye sinyali
- **Ne gösteriyor:** şu an uygulamadaki kişi sayısı (= farklı üye + kimliğini söylemeyen eski uygulama oturumu; ikisi ayrı yazılı), uygulama başına Web / iOS (iPhone) / iPadOS (iPad) / iPhone-iPad (eski uygulama) / macOS / Android, canlı sürüm tablosu, cihaz ve sistem, son 24 saat (saatlik, uygulamaya göre yığılmış), son 7 İngiltere günü, DAU/WAU/MAU + DAU/MAU, "bunu göremez" kartı. 30 sn'de bir yenilenir (yalnız sekme görünürken), geçmiş 5 dk'da bir; "Live / Not updating" durumu, Refresh, CSV.
- **Sinyal:** mevcut heartbeat kullanıldı, yeni yazma yolu eklenmedi. Aynı belge yazımına `device`, `appVersion`, `appBuild`, kaba `os`/`browser`, `hours.<UTC saat>` ve `expireAt` eklendi; uygulama oturum token'ını gönderirse sunucu doğrulayıp `uid` ve `staff` yazıyor (ekranda kimse adıyla görünmüyor; koleksiyon istemcilere kapalı). Saklama: her heartbeat `expireAt = şimdi + 8 gün` yazar ve silmeyi Firestore **TTL politikası** yapar; bu politika bir proje ayarıdır ve canlıda `appPresence` için **henüz yok** (29 Eki okuması: 18 koleksiyonda var, burada yok). Yayın adımı 0 olarak sahibe bırakıldı (paket README §6); açılana kadar silme yalnız `getSitePresence`'ın süpürmesiyle (admin Live/Global Statistics açıkken, çağrı başına ≤200, `lastSeenAt` 8 günden eski — `expireAt`'siz eski belgeler dahil) olur. Değişiklikten önceki birikim için tek seferlik `tools/cleanup-stale-presence.cjs` (kuru koşu varsayılan, `--apply` sahipte).
- **Eski sürümler dürüstçe:** Apple uygulamaları build numarasını zaten user-agent'ta gönderiyor ("NivaDesk/33" → 2.3), bu yüzden eski Mac/iPhone sürümleri tabloda doğru görünüyor. iPhone/iPad ayrımı, Android sürümü ve kim olduğu 2.4 gerektiriyor; o oturumlar "older app" diye ayrı sayılıyor ve personel/test olarak elenemediği yazıyor.
- **DAU/WAU/MAU:** Firebase Auth'un her hesap için zaten tuttuğu `lastRefreshTime` (açık uygulama saatte bir yeniler) — her sürüm, her platform, sıfır yeni yazma.
- **Maliyet:** heartbeat başına okuma/yazma sayısı değişmedi (SEC-FIX #48'in IP sayacı işlemi dahil 1 okuma + 2 yazma, öncesi ve sonrası aynı). Okuma yalnız Live/Overview açıkken; ayrıntı paket README §4.
- **Web istemcisi:** heartbeat artık cihaz sınıfı, web build kimliği ve oturum token'ı gönderiyor (eski sunucu yok sayar).
- **Native (2.4 adayı):** Apple: iPhone/iPad/Mac, `CFBundleShortVersionString`/`CFBundleVersion`, token. Android: telefon/tablet (600 dp), `VERSION_NAME`/`VERSION_CODE`, token; ve heartbeat artık **yalnız uygulama öndeyken** (`repeatOnLifecycle(STARTED)`), Apple'da SEC-FIX zaten öyle yapmıştı.

### 4.2 Yeniden tasarım ve kullanılabilirlik
- Gruplu gezinme (Pulse · Money · Customers · Product · Website), bölüm adreste, telefonda açılır menü, `nav`/`aria-current`, bölüm değişince sayfa başına kaydırma.
- Overview: "Right now / Business / Growth" başlıkları; tıklanabilir kutular ilgili bölüme götürür (ok işaretli); yenile/tekrar dene; iskelet yükleme; dürüst etiketler.
- Tema: yeni `--admin-*` değişkenleri (açık + koyu); sabit renkler kaldırıldı; hareket azaltma tercihine uyuluyor.
- Düzeltmeler: özel tarih çökmesi, UTC/İngiltere günü, sahte canlı çubukları, başarısız çağrıda "Live", "—" yerine 0, % sütunu, eski kart, admin tarayıcısının ziyaretçi sayılması.

### 4.3 Kanıt
- Web: `tsc` 0 hata; temiz `next build` (`.next` silinerek) rc=0; tüm `test:*` betikleri — yeni `test:admin-live-presence` 16/16, mevcut `test:admin-insights` geçiyor; 3 kırmızı (`test:finance`, `test:customer-card`, `test:team-schedule-key`) **canlı tabanda (10f2b8db) da aynı şekilde kırmızı** (ortam: `functions/` ağacı ve sunucu indeksi yok) — bu paketten değil.
- Sunucu: temizlik betiği emülatörde CLEANUP TEST OK (kuru koşu siler değil; `--apply` yalnız 8 günü aşanları siler); `src/test/presence.test.js` 17/17; emülatör kabulü ACCEPTANCE OK (aday 15/15, kontrol 11/15 kırmızı, canlı eşleşme 15/15); verify-tree OK; manifest ve sır adları aynı; PREFLIGHT OK; kilitli kuru koşu tüm kapılardan geçti.
- Ekran (yalnız demo-insights emülatörü, admin callable'larını dışa açan test sarmalayıcısı): Live ve Overview masaüstü koyu/açık, Live 375 px açık (yatay taşma yok), Global Statistics özel tarih boşaltma. Görüntüler: paket `screens/`.
- Native: derleme sonuçları paket README ve dal commit mesajında.

---

## 5. Öncelik listesi (sonraki adımlar, öneri)

| # | İş | Neden | Büyüklük |
|---|---|---|---|
| 1 | **Kullanıcı sayılarını görünüme bağla** (Overview/Users): personel + işaretli alan üyelerini iş görünümünde düş, Users'ta "aktif" = `lastRefreshTime` | "Total Users" ve "Active 7d" bugün test/personel dahil ve oturumu açık kalanı kaçırıyor | küçük, sunucu (`getAdminInsights`, `getAdminUsersWorkspacesDetail`) |
| 2 | **Gelir defteri:** Stripe/Apple/Google olaylarından MRR ve hareketleri (yeni/genişleme/daralma/kayıp/geri dönüş), deneme→ücretli, başarısız ödemeler — her biri isimli alan listesiyle | Rakiplerin hepsinin ana ekranı; bugün "Collected revenue: Not measured" | büyük; sahip kararı: hangi kaynak doğruluk kaynağı |
| 3 | **Ağır sayfaları günlük anlık görüntüye taşı** (not taraması, 20.000'lik taramalar, `listUsers`) | Feature Usage/Storage açılış başına on binlerce okuma | orta (yeni zamanlanmış fonksiyon = yeni maliyet/onay) |
| 4 | **Olay uyarıları** (yeni ücretli alan, iptal, başarısız ödeme) e-posta ile | Baremetrics/Mixpanel tarzı; bu ölçekte her olay önemli | orta; dış iletişim → sahip onayı |
| 5 | Ortak tarih aralığı + önceki dönem + CSV tüm tablolara | Rakiplerin ortak kontrolü | orta, yalnız web + bazı callable'lar |
| 6 | Sayılardan alan listesine inme (drill-down) | <100 alanda en değerli özellik (Stripe Explore) | orta |
| 7 | Grafik notları (sürüm, fiyat, kampanya) | sayının neden değiştiğini tarihe bağlar | küçük-orta |
| 8 | Google Search: hata türüne göre mesaj, sıra çizgisini ters çevir; Lookup etiketleri | küçük ux/a11y | küçük |

---

## 6. Ölçülemeyenler ve dürüst sınırlar
- Hiçbir şey canlıda ölçülmedi (yayın yok). Canlı veriden yalnız user-agent sayımı ve TTL politikaları listesi okundu.
- `appPresence` için TTL politikası açılmadan "8 gün sonra silinir" kendiliğinden gerçekleşmez (yukarıda §4.1); canlıdaki mevcut birikimin büyüklüğü okunmadı — temizlik betiğinin kuru koşusu sayar.
- Native değişiklik simülatörde/cihazda açılıp görülmedi; heartbeat'in gerçekten yeni alanlarla geldiği canlıda ancak 2.4 yayınından sonra görülür.
- 2.3 ve öncesi uygulamalar (bugün çoğunluk) kim olduklarını ve iPhone/iPad ayrımını göndermez; o oturumlar personel/test olarak elenemez. Sahibin arka planda açık 2.2 Mac'i bu yüzden 2.4'e kadar "older app" oturumu olarak görünmeye devam eder (Mac'te arka plan ping'ini SEC-FIX #48 zaten 2.4'te kapatıyor).
- `lastRefreshTime` "uygulaması açık ve oturumu yenilenmiş" demek; sayfa görüntüleme ya da işlem değil.
- Gizlilik: politika §4.4 cihaz türü, işletim sistemi, uygulama sürümü, giriş zamanları ve kullanılan özellikleri zaten sayıyor; meşru menfaat paragrafı "understanding product usage" diyor. Yeni bir veri türü eklenmediği için taslak hazırlanmadı. İstenirse tek cümlelik açıklama eklenebilir (TTL açıldıktan sonra doğru olur): "Uygulamanın açık olduğunu gösteren oturum kayıtlarını son görüldükleri andan itibaren 8 gün saklarız ve yalnız toplu sayım için kullanırız."
- Users & Workspaces, Subscriptions, Revenue, Plans, Feature Usage, Storage, Lookup, Setup Answers, Google Search, Landing ve Feedback ekranda gezilmedi; bulgular kod okumasıdır.
