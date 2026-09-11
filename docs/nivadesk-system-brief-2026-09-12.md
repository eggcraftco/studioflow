# NivaDesk: sistem ve çalışma düzeni özeti (12 Eylül 2026)

**Bu belge kimin için:** NivaDesk üzerinde çalışacak başka bir yapay zekâ asistanı için. Amacı, ürünün ne olduğunu, kodun nasıl düzenlendiğini, bugün canlıda ne olduğunu, nasıl çalıştığımızı ve sıradaki işleri tek okumada aktarmak.

**Kaynak:** bu özet 11–12 Eylül 2026'daki doğrulanmış duruma dayanır. Tek yetkili devir kaydı `docs/nivadesk-current-handoff.md`'dir; çelişki olursa o dosya ve kodun kendisi esastır, bu özet değil.

---

## 1. Ürün

NivaDesk, küçük atölye ve üretim işletmeleri için sipariş, üretim, müşteri, stok ve para akışını tek yerde yöneten bir iş uygulaması. Sahibi **EGGCRAFT LIMITED** (şirket no 16566512, UK). Ürün sitesi `nivadesk.app`, operatör hesabı `contact@eggcraft.co.uk`.

Hedef kullanıcı: kuyumcu, saatçi, terzi, onarım atölyesi, küçük üretici gibi hem özel iş hem ürün satışı yapan işletmeler.

Dört istemci aynı sunucuya bakar:

| İstemci | Teknoloji | Dağıtım |
|---|---|---|
| Web | Next.js 15 (App Router), Firebase Web SDK | Hostinger, ayrı yayın deposundan, "Round N" numaralı yayınlar |
| macOS + iOS | tek SwiftUI hedefi (`EGGcraft/`) | App Store, mağazadaki sürüm 1.3 (17) |
| Android | Kotlin + Compose (`studioflow-android/`) | Play, mağazadaki sürüm 0.1.8 |
| ChatGPT uygulaması | MCP sunucusu (`chatgptMcp`) | OpenAI uygulama dizini, 1.2.0 incelemede |

Sunucu: **Firebase Cloud Functions gen2**, proje `eggcraft-studio`, bölge `europe-west2`. 12 Eylül itibarıyla **446 fonksiyon canlı**. Veritabanı Firestore, dosyalar Cloud Storage.

---

## 2. Depo ve dallar

Tek depo: `~/Developer/studioflow-app`.

```
functions/            Cloud Functions (index.js ~30 bin satır + modüller: commerce/, finance/,
                      lifecycle/, inventory.js, bankFeed.js, accounting/, retention/, security/ …)
functions-amazon/     Amazon için ayrı, izole edilmiş kod tabanı (ayrı GCP projesi)
studioflow-web/       Next.js uygulaması (app/ rotaları, lib/studioflow/ iş mantığı)
EGGcraft/             SwiftUI macOS + iOS uygulaması
studioflow-android/   Android uygulaması
firestore.rules       Tüm erişim kuralları (tek dosya, reddetme listeleri kritik)
docs/                 65 kayıt dosyası: devir, yayın turları, güvenlik, gece raporları
```

**Deploy dalı:** `macbook-save-before-macstudio-2026-06-01`. Fonksiyonlar yalnız bu daldan ve **adıyla** deploy edilir. `firebase deploy --only functions` (topluca) yasaktır: dal ile canlı arasında eski fonksiyonlar olabilir.

**Worktree düzeni:** her iş kendi dalında ve kendi worktree'sinde yürür (`~/Developer/studioflow-<konu>`). Şu an açık olanlardan bazıları: `sales-faz0` (Sales planı), `dependency-highs-2026-09-11`, `retention-email-candidate`, `ebay-availability-fix`, `openai-resubmission`, `whatsapp-channel`, `mcp-orchestration`. Ayrıca mağaza sürümlerinin kaynağı iki detached worktree'de durur: `studioflow-old-1.3` (iOS/Mac 1.3 (17), `ad79d3da`) ve `studioflow-old-android` (0.1.8, `0563fc9c`). Bunlar "eski istemci ne yapıyor?" sorusunu cevaplamak için kullanılır.

**Web yayını:** kaynak depo canlı siteye doğrudan deploy edilmez. Ayrı bir yayın deposu vardır (`~/Developer/studioflow-hostinger-publish-20260530`); değişen dosyalar oraya **dosya bazında** kopyalanır, `npm run build` ile denenir, "Round N" başlıklı tek commit ile itilir, Hostinger yaklaşık 3 dakikada yayına alır. Geri dönüş o Round commit'inin revert'idir. Şu an canlı: **Round 176** (`8bf514e`).

---

## 3. Veri modeli (temel koleksiyonlar)

| Koleksiyon | Ne tutar |
|---|---|
| `siparisler` | **Her siparişin tek kaydı** (her kanaldan gelen dahil). Satırlar `lineItems[{id, name, quantity, unitPrice, lineTotal}]`, para alanları, durumlar, `commerce` damgası |
| `musteriler` | Müşteriler |
| `companies/{cid}` | Workspace: ad, sahip, plan, üyeler, rol ve erişim haritaları |
| `companies/{cid}/inventoryItems` | Stok: parti veya seri numaralı birim, `quantity{onHand, reserved, incoming}`, `reservations[]`, sahiplik (`business` veya `customer`) |
| `companySettings/{cid}` | Workspace ayarları: para birimi, KDV, iş akışı adımları, onboarding cevapları |
| `users/{uid}` | Kullanıcının aktif workspace'i |
| `externalEntities` | Dış kayıt kimliği: `provider + connection + entity + external_id` (tekillik burada) |
| `commerceEvents`, `commerceCursors`, `commerceHealth` | Bağlayıcı olayları, imleçler, senkron sağlığı |
| `bankTransactions`, `squarePayouts`, `paypalPayouts` | Banka akışı ve ödeme kuruluşu ödemeleri |
| `feedback`, `supportTickets`, `retentionMessages` | Geri bildirim, destek, tutundurma kartları |
| `appConfig/*` | Sunucu tarafı bayraklar (ör. `appConfig/commerce`); istemci bunları **okuyamaz**, callable üzerinden öğrenir |

Kritik kural: **para hesabı tek yerde.** `functions/finance/engine.js` (v4) saf motordur, altın vektörleri `vectors.json`'dadır ve web, Swift, Kotlin aynı vektörlerle test edilen aynaları çalıştırır. Sipariş yazıldığında `stampOrderFinance` tetikleyicisi `finance` bloğunu damgalar. Yeni bir ekran ciro hesaplamaz, bu bloğu okur.

---

## 4. Ana özellik alanları

- **Siparişler ve üretim:** sipariş kaydı, iş akışı adımları, üretim panosu (aşama saklanmaz, siparişin adımlarından hesaplanır), teslim ve kargo takibi, onarım kabul kartı, teklif/onay/imza akışı.
- **Stok:** parti ve seri numaralı takip, lokasyon, hareket defteri, sayım, satın alma ve tedarikçi, reçete, siparişe rezervasyon ve tüketim. Tüm stok yazımları sunucu callable'ları üzerinden yapılır; kurallar istemci yazımını reddeder.
- **Para:** ödeme kayıtları, iade, fatura numarası, KDV (fiyata dahil modeli), kâr/marj, CSV dışa aktarma, banka akışı (TrueLayer), Pandle ve PayPal beslemeleri, Square payout ↔ banka eşleştirmesi.
- **Muhasebe bağlayıcıları:** QuickBooks ve Xero (OAuth, katalog eşleme, webhook).
- **Mağaza bağlayıcıları:** Shopify, WooCommerce, Etsy, Square canlı sipariş çekiyor; eBay kodu canlıda ama kapalı; Amazon ayrı, sertleştirilmiş projede ve kişisel veri izolasyonu ile.
- **Müşteri yüzeyleri:** müşteri portalı, markalı alan adı (Cloudflare SaaS), dosya paylaşım bağlantıları, SMS bildirimleri (Twilio), e-posta.
- **Yapay zekâ:** ChatGPT MCP uygulaması, uygulama içi asistan, hızlı yanıtlar (AI Replies), rehber (guide) ve site sohbeti.
- **Büyüme:** onboarding sihirbazı, kurulum kontrol listesi, aktivasyon funnel'ı, geri bildirim toplama, tutundurma (retention) kartları.

Web rotaları: `/home`, `/orders`, `/production`, `/dashboard`, `/bank`, `/schedule`, `/team-schedule`, `/notes`, `/customers`, `/inventory`, `/files`, `/messages`, `/quick-reply`, `/settings`, `/admin` ve müşteriye açık sayfalar (`/e`, `/f`, `/track`, pazarlama sayfaları).

---

## 5. Çalışma sistemi (en önemli bölüm)

Bu proje "hızlı yaz, sonra bak" ile yürümüyor. Kurallar operatörün koyduğu kurallar; bir asistan bunlara uymak zorunda.

**1. Onay kapısı.** Canlıya giden hiçbir şey kendiliğinden yapılmaz. Deploy, web Round, kural yayını, secret oluşturma, mağaza yüklemesi, dış mesaj gönderimi: hepsi operatörün açık onayını ister. Onay bir iş için verilir, sonrakine taşınmaz.

**2. Deploy runbook'u.** `docs/audit-deploy-checklist.md`. Her fonksiyon deploy'undan önce: doğru dalda mıyız, çalışma ağacı temiz mi, `functions/` ağacı origin ile aynı mı, Stripe düzeltmesi ata mı, `functions/.env` yerinde mi. Deploy yalnız adla. Her deploy'un geri dönüş revizyonu yazılır.

**3. Kanıt disiplini.** Bir davranış ancak gözlendiyse "geçti" sayılır. Emülatör kanıtı, simülatör kanıtı, fiziksel cihaz kanıtı ve mağaza sürümü kanıtı **ayrı satırlardır**, birbirinin yerine geçmez. Gözlenmeyen neden elenmiş sayılmaz. Fiil seçimi bile buna bağlıdır: "komut ulaştı, log kaydetti" denir, "sorun çözüldü" denmez.

**4. Beş platform kuralı.** Kullanıcı akışına dokunan her değişiklik beş satırda değerlendirilir: masaüstü web, iPhone Safari, Android Chrome, iOS/macOS uygulaması, Android uygulaması. Etkilenmeyen platform gerekçesiyle yazılır. Kontrol listesi `docs/release-checklist-platforms.md`.

**5. Kayıt kültürü.** Her tur kendi kayıt dosyasını bırakır (`docs/ebay-web-deploy-round-*.md`, gece raporları, güvenlik kanıtları). Devir kaydı `docs/nivadesk-current-handoff.md` her oturumda güncellenir; bir asistan işe başlarken **önce onu** okur. Ayrıca kalıcı hafıza notları vardır (`~/.claude/projects/.../memory/`), her biri tek bir gerçeği taşır.

**6. Test altyapısı.** `functions/` altında yaklaşık 1.700 test koşan bir paket var (`npm test`), ayrıca kurallar ve uçtan uca testler Firebase emülatörleriyle çalışır. CI (`functions-tests.yml`) yalnız `functions/**`, kurallar ve birkaç web dosyası değişince tetiklenir; web-only değişiklikte CI yeşili yeterli kanıt değildir, tip denetimi ve derleme ayrıca yapılır.

**7. Emülatör tuzağı.** Emülatör interneti taklit etmez: gerçek secret'ları çeker ve gerçek e-posta veya SMS gönderebilir. Posta için kod içinde bir kapı var; yeni bir dış çağrı eklerken "bu emülatörde gerçekten gider mi?" diye sormak gerekir. Test verisi için yalnız emülatördeki QA workspace'leri kullanılır.

**8. Gizlilik ve güvenlik.** Secret, token, şifre, OAuth kodu hiçbir log'a, commit'e, belgeye veya sohbete yazılmaz. Müşteri verisi rapora kopyalanmaz. Amazon ve eBay alıcı verisi ayrı bir izolasyon katmanındadır ve asistan, AI yanıtları, mesajlaşma, analitik, muhasebe ve dışa aktarma kanallarında reddedilir.

---

## 6. Bugün canlı olan durum (12 Eylül 2026)

| Alan | Durum |
|---|---|
| Web | Round 176 canlı. Son üç tur: 174 (eBay sunum düzeltmesi, workspace çözümleme, telefon düzeni), 175 (telefonda Settings kaydırması), 176 (Settings listesi workspace doğrulanınca açılıyor, detaylar sonra) |
| Fonksiyonlar | 446 fonksiyon canlı. Son deploy'lar: `getEbayConnections`, `submitFeedback`, `getActivationFunnel`, retention okuyucuları |
| Mağaza sürümleri | iOS/Mac 1.3 (17) ve Android 0.1.8 **eski koda dayanıyor**. Son üç turun düzeltmeleri onlarda yok |
| eBay | Sandbox bağlantısı canlı; yalnız bağlanma fonksiyonları açık, sipariş çekme kapalı. eBay tarafında Sandbox sipariş oluşturma bozuk, ETA yok |
| Amazon | Ayrı sertleştirilmiş proje kurulu; ana projede ingest fonksiyonları var; Google destek vakası açık, güncelleme 15 Eylül'e kadar bekleniyor |
| OpenAI | 1.2.0 incelemede; MCP ve OAuth yüzeyi donduruldu, yeniden deploy edilmiyor |
| Retention pilotu | Tek workspace'te in-app pilot canlı. **Bugün (12 Eylül ~12:20 UTC) doğal kartın görünmesi, sentetik siparişin geri yüklenmesi ve `goal_met` ile kapanması bekleniyor.** O ana kadar pilot hesabında yeni feedback veya sipariş oluşturulmaz, e-posta kapalı kalır |
| Bekleyen adaylar | `dependency-highs-2026-09-11` (üç yüksek bağımlılık bulgusu override ile kapandı, CI yeşil, merge onayı bekliyor), `/f/` dosya görüntüleyici güvenlik düzeltmesi (yazıldı, canlıda değil), retention e-posta aşaması, native geri bildirim ekranları |

---

## 7. Son dönemde yapılanlar (11 Eylül)

1. **Workspace çözümleme hatası düzeltildi.** Okuma hatası artık kullanıcıyı kişisel workspace'e düşürmüyor ve `activeCompanyId` alanını ezmiyor. Üç istemcide aynı saf karar modülü ve testleri var. Web canlı, native mağaza sürümleri bekliyor.
2. **eBay kartı sunum hatası.** Kart her workspace'e "Available" diyordu, sunucu ise bağlanmayı reddediyordu. Sunucu artık `workspaceEnabled` döndürüyor, istemciler üç durumlu gösteriyor.
3. **Telefon düzeltmeleri.** iPhone'da alan odağında kayma, çekmecenin kaydırılamaması, Android'de rozet çakışması; ayrıca Settings ızgarasının tek ekran yüksekliğine kilitlenmesi (Round 175) ve Settings'in yüklenme sırası (Round 176).
4. **Yapılacaklar taraması.** SSRF düzeltmesinin canlıda olduğu kaynak arşivinden doğrulandı; `/f/` düzeltmesinin canlıda olmadığı bulundu ve onay paketi yazıldı; Stripe düzeltmesinin henüz canlı bir olay görmediği günlükten doğrulandı; bağımlılık bulguları major yükseltme olmadan kapatıldı.
5. **Sales planı Faz 0.** Aşağıdaki bölüm.

---

## 8. Sıradaki iş: Sales / Products planı

Operatör 11 Eylül'de "ürün satan işletmeler için görünür bir Sales alanı" kararını içeren bir plan verdi (`NivaDesk-Sales-Products-Plan-2026-09-11.md`, depo kökü). Karar: **Sales** ana alanı, içinde **Sales / Products / Channels** sekmeleri; mevcut sipariş, stok ve finans altyapısı ortak kullanılır; pazaryerine ilan yayınlama ve stok yazma sonraki fazlar.

**Faz 0 tamamlandı** (dal `sales-faz0`, kayıt `docs/sales/faz0-2026-09-11.md`). Bulguları sonraki her adımı belirliyor:

1. Tek sipariş kimliği zaten var; ikinci bir sipariş veya finans motoru kurulmayacak.
2. Sipariş satırları ürüne bağlı değil ve sunucu bilinmeyen satır alanlarını siliyor.
3. **Mağazadaki iOS/Mac 1.3 sürümü ücretli planlarda sipariş belgesinin tamamını yeniden yazıyor.** Bu yüzden Sales verisi siparişin içine değil, sunucunun yazdığı yan belgelere konacak (`salesOrders`, `salesProducts`, `salesSettings`).
4. Ürün kataloğu yok; stok kayıtlarında satış fiyatı bile yok.
5. Rezervasyon atomik ama sekiz sunucu yolu stoğu sonradan bozabiliyor ve hiçbir stok olayı tekrar denemeye dayanıklı değil. Bu yüzden stoklu satış (Faz 2) bir sertleştirme PR'ını bekliyor.
6. Kanal yetenek listesi abartıyor; Channels sekmesi yetenek cevabını dört gerçekten üretmeli: kod destekliyor mu, kapsam verildi mi, fonksiyon açık mı, bağlantı sağlıklı mı.

**Faz sırası:** Faz 1 (bayrak arkasında Sales görünümü ve katalog temeli) → Faz 2 (elle New sale ve sunucu tarafı rezervasyon) → Faz 3 (kanal ilanı okuma ve eşleştirme) → Faz 4 (tek kanala kontrollü stok yazma) → Faz 5 (ilan yayınlama).

**Operatörün vermesi gereken altı karar** Faz 0 kaydının §8'inde duruyor: sınıflandırmanın yeri, ürün ile stok bağı, demo plan kotası, pilot için asgari native sürüm, kanal yetenek düzeltmesinin ayrı yayınlanması, Faz 1 pilot workspace'i.

Diğer bekleyen kuyruk: banka yol haritasının native eşitliği, Pandle fazları, WhatsApp kanalı, MCP orkestrasyonu, mağaza sürümü paketleri.

---

## 9. Dokunulmaz alanlar

- **Retention pilot workspace'i** (`GuglEFKSEKNTq1xibFpJav3EWkY2`, hesap `contact@nivadesk.co.uk`): kabul dizisi bitene kadar yeni feedback, sipariş veya yazma yok.
- **OpenAI inceleme workspace'i** (`KSQidetb3oOSItE9amLISf9Lh6h2`) ve `review@nivadesk.app` hesabı: tamamen dışarıda.
- **Gerçek EGGcraft iş verisi:** operatöre ait olması onu QA verisi yapmaz. Test için emülatör workspace'leri kullanılır.
- **Mağaza yüklemesi ve Submit:** asistan yapmaz.
- **IAM, secret değeri, ödeme ve dış mesaj:** operatörün işi.
- **Fiziksel telefonlarda** uygulama silme, veri temizleme yok; mağaza uygulamasının üzerine kurulum açık onay ister.

---

## 10. Nereden okumalı

| Soru | Dosya |
|---|---|
| Bugün ne durumdayız? | `docs/nivadesk-current-handoff.md` (en üstteki bölüm) |
| Deploy nasıl yapılır? | `docs/audit-deploy-checklist.md` |
| Hangi platformda ne kanıtı gerekir? | `docs/release-checklist-platforms.md` |
| Son web yayınları | `docs/ebay-web-deploy-round-174.md`, `-175`, `-176` |
| Sales planı ve kod haritası | depo kökündeki plan dosyası + `docs/sales/faz0-2026-09-11.md` |
| Güvenlik kayıtları | `docs/security/` (açık bulgu: `file-proxy-release-package-2026-09-11.md`) |
| Bağımlılık politikası | `docs/security/vulnerability-management.md`, `docs/security/audit-allowlist.json` |
| Gece çalışma raporları | `docs/night-report-2026-09-10.md`, `-11` |

---

## 11. Bir asistan işe başlarken

1. Devir kaydını oku, sonra `git status` ve `git log` ile gerçek durumu doğrula. Kayıt ile kod çelişirse kodu esas al ve kaydı düzelt.
2. Tamamlanmış işi yeniden açma; bitmiş testleri yeniden koşma.
3. Canlıya giden her adım için önce kapsamı yaz, onayı al, sonra yap. Geri dönüş yolunu kayda geç.
4. Kanıtı gözlemle sınırla; emülatör sonucunu cihaz sonucu gibi sunma.
5. Bulduğun her yeni açığı, düzeltmeden önce kaydet: hangisi canlıda, hangisi yalnız kodda.
