# NivaDesk — Eklenti / Entegrasyon Denetimi (dış göz)

Tarih: 3 Eylül 2026. Kapsam: kullanıcının bağlayabildiği her şey — Etsy, Shopify, WooCommerce, genel webhook (Wix / Squarespace / Zapier / Make), Open Banking (TrueLayer), PayPal, Square, QuickBooks Online, Xero, Pandle, ChatGPT uygulaması (MCP), web sitesi sohbet botu, uygulama içi asistan, AI Quick Replies, Twilio SMS, e-posta, özel alan adı (Cloudflare), 17TRACK kargo takibi ve faturalama rayları (Stripe / Apple / Google Play / Shopify Billing).

Yöntem: (1) emülatörde ayağa kaldırılan gerçek yığında on beş webhook ucu kimlik doğrulaması olmadan yoklandı, MCP OAuth akışı adım adım denendi, entegrasyon merkezi kullanıcı gibi gezildi; (2) altı ayrı salt-okunur kod denetimi (Etsy · Shopify+Woo+webhook · Banka+PayPal+Square · Muhasebe · ChatGPT/AI · SMS-domain-tracking-hub); (3) kritik para ve izin iddiaları benim tarafımdan koddan tek tek doğrulandı. Hiçbir dosya değiştirilmedi, hiçbir şey deploy edilmedi, üretime hiç yazılmadı, sağlayıcılara gerçek bağlantı kurulmadı.

Her madde bir **kontrol sorusu**dur. Kanıt olarak dosya:satır verildi; belirsizler "verify:" ile işaretli. Öncelikler: **[Kritik]** para yanlış / veri kaybı / güvenlik / sessiz kesinti · **[Yüksek]** özellik kullanılamıyor ya da yanıltıyor · **[Orta]** sürtünme · **[Düşük]** cila.

---

## 0) ÖNCE BUNLAR — 32 başlık

### Güvenlik

1. **ChatGPT bağlantısında yönlendirme adresi hiç doğrulanmıyor.** Emülatörde bizzat denendi: istemci kaydı herkese açık ve oran sınırsız, kayıtlı olmayan bir adres yetkilendirme ucundan onay ekranına geçiyor, onay ve token adımları yalnız "kodun içindeki adres" ile karşılaştırma yapıyor, onay ekranı hedefi göstermiyor. Gerçek alan adında görünen bir bağlantıyla kullanıcı onay verirse yetkilendirme kodu üçüncü tarafa gider. (Elle test #4; ChatGPT/AI #2)
2. **Alınan jeton iptal edilemiyor ve hiçbir yerde görünmüyor.** Otuz gün geçerli; `revokedAtMs` alanını sıfırdan yukarı çeken tek bir kod yolu yok ve uygulamada "ChatGPT bağlı" diyen bir ekran da yok. Üçü birlikte sessiz, kalıcı, görünmez bir arka kapı oluşturuyor. (ChatGPT/AI #3, #4, #36)
3. **MCP araçları rol ve alan iznini atlıyor.** Sipariş arama ve detay araçları ödenen, kalan ve maliyet alanlarını finans izni sorulmadan döndürüyor; sipariş araçları çalışma alanının "Orders" erişim bayrağına hiç bakmıyor; inceleme bayrağıyla listeden gizlenen araçlar çağrı katmanında hâlâ canlı. (ChatGPT/AI #9, #10, #11)
4. **AI ve muhasebe anahtarları düz metin.** Müşterinin OpenAI anahtarı uygulama katmanında şifrelenmeden saklanıyor; eski `companySettings` alanı geçiş tembel olduğu için çalışma alanının bütün rollerine okunabilir bir dokümanda kalmış olabilir. Pandle'ın erişim ve yenileme jetonları da düz metin, banka yenileme jetonu da öyle; diğer yedi bağlayıcı şifreli. (ChatGPT/AI #22, #23; Muhasebe #5; Banka #4)
5. **Kimliksiz bir istek, atölyenin entegrasyon panosunu bozuk gösteriyor.** Token'sız POST 401 alıyor ama önce kiracının teslimat günlüğüne başarısız kayıt düşüyor; Wix, Squarespace, Zapier ve Make kartlarının dördü birden "Needs attention" oluyor. (Elle test #1)
6. **OAuth ve MCP uçlarının hiçbirinde test yok.** PKCE uyuşmazlığı, tekrar kullanılan kod, yanlış yönlendirme, çapraz çalışma alanı erişimi, araç yetkilendirmesi: hiçbiri test edilmiyor. Aynı ekip Etsy OAuth'u için örnek nitelikte negatif yol testleri yazmış. (ChatGPT/AI #14)
7. **Banka akışının Pro plan kapısı yalnızca tarayıcıda.** Sunucu kodunda `bank_feed` anahtarı hiç geçmiyor; Free plandaki bir sahip callable'ları doğrudan çağırarak akışı açabilir. (Banka #1)

### Para doğruluğu

8. **Mağaza siparişlerinde iade hiçbir kanalda geliri düşürmüyor.** Ortak eşleyicide iade durumları ödenmiş sayılıyor, ödenen tutar siparişin tamamı yazılıyor, iade tutarı alanı hiç doldurulmuyor. Square, WooCommerce, Etsy ve Shopify aynı katmanı paylaşıyor. Bankadan gelen iadeler doğru işleniyor, yani model var, mağaza tarafı kullanmıyor. (Kendi doğrulamam #1; Banka #30; Etsy #2)
9. **Etsy'de iptal edilen sipariş asla iptal olmuyor.** İçe aktarıldıktan sonra alıcı siparişi iptal ederse ne webhook ne mutabakat bunu işliyor; sipariş canlı iş olarak kalıyor ve tam tutar gelir sayılmaya devam ediyor. (Etsy #1)
10. **Komisyonlar kâra hiç yansımıyor.** Etsy komisyonu her siparişte sıfır yazılıyor; PayPal komisyonu veri modelinde var ama hiçbir toplamda düşülmüyor, yalnız tek işlem çekmecesinde görünüyor; Square işlem komisyonu listede hiç yok. Üç kanalda da kâr olduğundan yüksek. (Etsy #8; Banka #47, #39)
11. **PayPal'dan bankaya inen para çift sayılabiliyor.** Otomatik eşleştirme var ama başarısız olduğunda (belirsiz aday, kur farkı, üç günlük pencere dışı, yüz yirmi günden eski) ikinci satır sıradan gelir olarak kalıyor ve hiçbir uyarı çıkmıyor. Ekibin kendi mühendislik notu bunu "en önemli yapısal sorun" diye işaretlemiş. (Banka #25)
12. **Pandle'da PayPal ayrı hesap olarak modellenmemiş** ve önizleme sorgusu bütün banka satırlarını sağlayıcı filtresi olmadan okuyor. (Muhasebe #7)
13. **Sohbet asistanı banka rakamlarını web panelinden farklı hesaplıyor.** Aktarımlar, sahip katkıları ve iadeler ayıklanmadığı için sahibine şişirilmiş bir "bu ay ne geldi" rakamı veriyor. Doğru mantık aynı kod tabanında var, kullanılmıyor. (Banka #3)
14. **Etsy geliri panoda "manuel" kanal sayılıyor** ve Etsy'nin yazdığı döviz alanı hiç okunmuyor. (Etsy #7)

### Sessiz kesintiler ve yanlış durum

15. **Etsy günlük kotası bütün müşteriler arasında paylaşılıyor** ve elle tetiklenen yollarda hiç kontrol edilmiyor. Tek müşterinin arka arkaya senkron denemesi platformdaki her Etsy bağlantısını hız sınırına düşürebilir. (Etsy #3)
16. **Aynı Etsy mağazası iki çalışma alanına bağlanabiliyor**; webhook mağazayı bulurken ilk eşleşen satırı seçtiği için sipariş rastgele başka bir çalışma alanına düşebilir. Aynı sorun Square'de de var. (Etsy #4, #5; Banka #38)
17. **Şifreleme anahtarı rotasyonunun kurtarma yolu yok.** Anahtar değişirse jetonlar kalıcı olarak çözülemez ve kullanıcıya "yeniden bağlan" düğmesi bile görünmez. Xero, QuickBooks'un anahtarını paylaşıyor. (Muhasebe #3, #4, #6)
18. **QuickBooks webhook'u canlıda hiç ateşlenmedi**; ana karttaki yeşil bağlı rozeti bu boşluğu göstermiyor. Gerçek zamanlı senkron bugün altı saatlik taramayla ayakta. (Muhasebe #9, #10)
19. **Bozuk banka bağlantısı bir kez haber verip susuyor.** Bildirim yalnız durum değiştiğinde gidiyor; haftalarca aynı hatada kalan bir akış bir daha hatırlatmıyor. Rıza bitişi için de önceden uyarı yok, yalnız sayfada turuncu bir tarih. (Banka #9, #12)
20. **Emekli Shopify ve WooCommerce uçları 410 dönüyor.** Mağazasında eski adresi bırakmış bir kullanıcının siparişleri sessizce durur; NivaDesk tarafında bunu anlatan uyarı yok. (Elle test #3)
21. **Muhasebe bağlayıcılarında defter yazımı hiç yok** ve web dışındaki üç platformda üç sağlayıcı da "yakında" görünüyor. Arayüz salt okumayı dürüstçe söylüyor, ama ürünün muhasebe vaadi bugün okumadan ibaret. (Muhasebe #1, #15)
22. **Müşteri iletişim tercihleri gönderimi durdurmuyor.** "Do not contact" işareti yalnız kaydediliyor, hiçbir gönderim yolunda okunmuyor; SMS ülke kodu her çalışma alanında varsayılan olarak Birleşik Krallık; vazgeçme kaydı hiç tutulmuyor. (Kendi doğrulamam #2, #3, #4)

### Küçük entegrasyonlardan çıkan altı başlık daha

23. **Kargo takip numarası sahiplenilebiliyor.** Takip kaydı global bir tabloya sahiplik kontrolü olmadan yazılıyor; aynı numarayı bilen başka bir çalışma alanı eşlemeyi kendine çevirirse gerçek sahibin siparişi bir daha güncellenmez ve sevkiyat durumu karşı tarafa görünür. (SMS-hub #19)
24. **Kargo yenileme işi ilk seksen kayıtta takılı.** Sıralama ve imleç olmadan sabit bir sınır kullanılıyor; platformdaki aktif takipli sipariş bu sayıyı geçtiğinde geri kalanı hiç yenilenmiyor. (SMS-hub #20)
25. **Portal fotoğraf bağlantıları iptalden sonra da açık kalıyor.** Depolama jetonu adresin içinde gidiyor; müşteri bağlantıyı kopyalarsa portal iptal edilse bile erişim sürüyor. Dosya paylaşım bağlantılarının ise hiç iptal yolu yok. (SMS-hub #11, #12)
26. **Özel alan adında sertifika hiç çıkmamış olabilir.** Cloudflare anahtarı yer tutucu değerdeyse sertifika bloğu hiç çalışmıyor, buna rağmen arayüz "birkaç dakika içinde hazır olur" diyor. (SMS-hub #10, verify)
27. **Apple faturalama bildirimlerinde sıralama koruması yok.** Stripe tarafında geç gelen eski olay reddediliyor, Apple tarafında aynı koruma yok; geç gelen bir yenileme bildirimi iptal edilmiş aboneliği yeniden aktif gösterebilir. (SMS-hub #26)
28. **Bağlayıcı bazlı denetim kaydı yok.** "Kim ne zaman hangi entegrasyonu bağladı ya da kopardı" sorusunun cevabı hiçbir yerde tutulmuyor; genel ayar günlüğü bu koleksiyonları görmüyor ve kendisi de ücretli planın arkasında. (SMS-hub #38, #39)

### Shopify/WooCommerce denetiminden gelen dört başlık

29. **WooCommerce'de özel adres kontrolü yalnız bağlanma anında.** Mağaza alan adı sonradan iç ağa ya da bulut metadata adresine çevrilirse, on beş dakikalık mutabakat işi oraya kimlik doğrulamalı istek atmaya devam eder. (Shopify-Woo #1)
30. **Genel webhook kanalı ortak motoru hiç kullanmıyor.** Sıra dışı teslimat (ödendi, iade, yeniden ödendi) ve tekrar koruması bu kanalda yok; aynı korumalar WooCommerce'de çalışıyor, Shopify'da yalnız gölgede karşılaştırılıyor. Üç kanal motorun üç ayrı aşamasında. (Shopify-Woo #30, #33)
31. **Uygulaması kaldırılmış Shopify mağazası panoda hâlâ "Connected" görünüyor**, hem web hem Android'de aynı hata bağımsız olarak tekrarlanmış. (Shopify-Woo #6)
32. **Park edilmiş siparişlerin ham kişisel verisi süresiz saklanıyor.** Adı, e-postası, telefonu ve adresi maskelenmeden yazılıyor ve silinme süresi yok; kod başka yerlerde bu hijyeni uyguluyor. Ayrıca kayıtlara "expireAt" damgası basılıyor ama depoda hiçbir silme politikası tanımlı değil. (Shopify-Woo #46, #47)

**Not:** WooCommerce'in "yakında" göründüğü sorun, denetim sırasında kapanmış çıktı; üç platformda da artık gerçek bağlayıcı olarak işaretli.

### Bir denetim yanlış çıktı, düzeltildi

SMS/hub denetiminin "banka, muhasebe, Square ve WooCommerce jetonlarının hiçbiri şifrelenmiyor" maddesi kaynaktan doğrulandı ve **yanlış** bulundu. Gerçek durum: Etsy, Shopify, Square, WooCommerce, QuickBooks, Xero ve PayPal sırrı şifreli; yalnız **TrueLayer banka yenileme jetonu** ile **Pandle jetonları** düz metin. Ayrıntı ve satır numaraları 2. bölüm madde 10'da.

---

### İyi çalışan taraf

Webhook imzaları ham gövde üzerinden zamanlama güvenli karşılaştırılıyor ve on beş ucun on dördü kimliksiz isteği reddediyor. Shopify'ın zorunlu gizlilik webhook'ları uygulanmış, uygulama izinleri yalnız okuma. Portal, teklif ve dosya bağlantı jetonları 192 bit. Banka tarafında "para hareket ettiremez" iddiası istenen izinlerle tutarlı, "bağlı" rozeti canlı durumdan türetiliyor, sabah kopması hatası kodda düzeltilmiş. Pandle gönderimi istemciye hiç güvenmiyor, satırı gönderim anında sağlayıcıdan yeniden okuyup yön, kuruş ve tarihi doğruluyor. Etsy'nin bağlanmadan önceki izin ekranı ve genel webhook kartının açıklama metni örnek alınacak nitelikte.

---

# 1) ELLE TEST — Entegrasyon uçları ve arayüzü, emülatörde denendi

Ortam: yerel Firebase emülatörü (auth 9099 / firestore 8080 / functions 5001, `functions/.env` yüklü) + `localhost:3000` dev sunucusu (`NEXT_PUBLIC_FIREBASE_EMULATOR=1`). Hesap: `review@nivadesk.app` (Team planı, owner), çalışma alanı `qa-workspace`. Üretime hiç istek gitmedi; sağlayıcıya gerçek çağrı yapan "Connect/Continue" düğmelerine bilinçli olarak basılmadı (emülatör gerçek sırları okuyup dışarı çağrı yapabiliyor).

## A. Webhook uçları — kimlik doğrulaması olmadan yoklama

Her uca imzasız/token'sız POST atıldı. Sonuçlar:

| Uç | Yanıt |
|---|---|
| `inboundOrderWebhook` (companyId yok) | 400 `Missing companyId…` |
| `inboundOrderWebhook` (yanlış token) | 401 `unauthorized` |
| `woocommerceOrderWebhook` | **410 `integration_retired`** |
| `wooConnectorWebhook` | 401 `unknown_connection` |
| `shopifyOrderWebhook` | **410 `integration_retired`** |
| `shopifyAppWebhook` | 401 `invalid_hmac` |
| `squareWebhook` | 401 `invalid_signature` |
| `etsyWebhook` | 401 `{"ok":false}` |
| `quickbooksWebhook` | 401 `invalid_signature` |
| `xeroWebhook` | 401 (gövde boş) |
| `track17Webhook` | 401 `invalid_token` |
| `smsDeliveryWebhook` | 403 `Invalid signature` |
| `stripeWebhook` | 400 `Missing Stripe signature` |
| `appleAppStoreServerNotification` | 400 `verification_failed` |
| `googlePlayRtdnNotification` | **200 `{"received":true,"skipped":"no_subscription_notification"}`** |

**Sonuç: imza/token kapıları çalışıyor.** İki nokta dışında.

1. **[Yüksek] Kimliksiz POST, kiracının teslimat günlüğüne yazıyor ve dört entegrasyonu "Needs attention" yapıyor.** Token'sız isteğim reddedildi (401) ama önce `recordIntegrationDelivery` ile `qa-workspace`'in günlüğüne "no token in the delivery URL" satırı düştü. Arayüzde hemen göründü: *"Last delivery failed: 03/09/2026, 16:09:35 — no token in the delivery URL"*, ve Wix/Squarespace/Zapier/Make kartlarının dördü birden kırmızı **Needs attention** oldu. companyId'yi bilen (veya `requestWorkspaceAccess` ile e-postadan öğrenen) biri, hiç token'a sahip olmadan bir atölyenin entegrasyon panosunu "bozuk" gösterebilir ve günlüğü şişirebilir. Kanıt: `functions/index.js:19943-19949` (401 dalında kayıt), `studioflow-web/lib/studioflow/integrations.ts:314` (son teslimat başarısızsa `attention`). Kontrol: doğrulanmamış istekler kiracı günlüğüne hiç yazılmasın mı, yoksa ayrı bir "reddedilen istekler" sayacına mı gitsin?
2. **[Düşük — kontrol edildi, açık değil] `googlePlayRtdnNotification` imzasız isteğe 200 dönüyor ama plan değiştirmiyor.** Uç Pub/Sub imzası/OIDC aramıyor; ancak abonelik bildirimi geldiğinde satın alma token'ını `fetchGooglePlaySubscription` ile Google'a doğruluyor ve çalışma alanını yalnız `obfuscatedAccountId` üzerinden buluyor. Uydurma gövde ya "no_subscription_notification" ile yutuluyor ya da doğrulamada düşüyor. Kalan tek etki: herkesin çağırabildiği bir kabul noktası (günlük gürültüsü, ölçülü maliyet). Kanıt: `functions/stripeBilling.js:2075-2110`. Kontrol: uç yalnız Pub/Sub servis hesabına açılabilir mi (OIDC doğrulaması)?
3. **[Yüksek] Emekli uçlar 410 dönüyor — eski mağaza yapılandırması sessizce ölür.** `woocommerceOrderWebhook` ve `shopifyOrderWebhook` artık `integration_retired` diyor. Bir müşteri mağazasında bu eski URL hâlâ tanımlıysa siparişler gelmez; NivaDesk arayüzünde bu durumu anlatan bir uyarı görmedim (410 yanıtı mağaza panelinde "başarısız teslimat" olarak görünür, NivaDesk'te değil). Kanıt: `functions/index.js:18611-18613`, `:18607`. Kontrol: eski URL'lerden gelen 410'lar için "bağlantı yöntemi değişti, şu adımı izleyin" bildirimi var mı?

## B. ChatGPT / MCP OAuth — pratik yoklama (KRİTİK)

`chatgptMcp` ucu: token'sız `tools/list` ve `initialize` **200** dönüyor (araç kataloğu herkese açık: 19 araç, `create_order`, `update_order_status`, `get_order_financials`, `search_bank_transactions`, `attach_bank_receipt` dahil). Token'sız `tools/call` doğru şekilde reddediliyor (`unauthenticated`, `_meta` içinde WWW-Authenticate ipucu), uydurma Bearer da reddediliyor (`Invalid Firebase ID token`). Buraya kadar sağlıklı.

**Ama OAuth akışında yönlendirme adresi hiç doğrulanmıyor:**

4. **[Kritik] Kayıtlı olmayan `redirect_uri` kabul ediliyor → yetkilendirme kodu saldırganın sunucusuna gidebilir.** Pratikte yaptım: (a) `chatgptOAuthRegister`'a herhangi bir istemci kaydettim — açık kayıt, kimlik doğrulaması yok, oran sınırı yok (8 ardışık istek 8×201); (b) `chatgptOAuthAuthorize`'a o istemcinin **hiç kaydetmediği** `https://attacker2.example/cb` adresini verdim → 302 ile `nivadesk.app/chatgpt/connect?...redirect_uri=https%3A%2F%2Fattacker2.example%2Fcb...` onay ekranına yönlendirdi. Kodda karşılaştırma yok: `chatgptOAuthApprove` `redirect_uri`'yi gövdeden alıp koda gömüyor ve oraya yönlendiriyor; `chatgptOAuthToken` yalnız "kodun içindeki adresle aynı mı" diye bakıyor, kayıtlı adres listesiyle karşılaştırmıyor. PKCE burada koruma sağlamaz, çünkü challenge'ı saldırgan üretiyor. Onay ekranı da hedefi göstermiyor: "Connect NivaDesk / Allow ChatGPT" yazıyor, hangi adrese kod gideceği hiçbir yerde yok. Sonuç: gerçek nivadesk.app alan adında görünen bir bağlantıyla kullanıcı "Allow" derse, üçüncü taraf `orders.read/write`, `notes.*`, `finance.read`, `tasks.write` kapsamlı token alır; sipariş/müşteri/finans verisi okunur ve sipariş yazılabilir. Kanıt: `functions/index.js:23365-23375` (`nvSafeOAuthUri` yalnız http/https'e bakıyor), authorize dalında kayıt kontrolü yok; approve dalında `redirect_uri` gövdeden (`chatgptOAuthApprove` içinde `nvSafeOAuthUri(body.redirect_uri)`), token dalında yalnız `codeData.redirectUri === redirectUri` karşılaştırması; onay ekranı `studioflow-web/app/chatgpt/connect/ChatGPTConnectClient.tsx:266-271, 353-354`. Kontrol: `redirect_uri` istemci kaydındaki listeyle birebir eşleşmeli (ve `http:` üretimde reddedilmeli); onay ekranında hedef alan adı kullanıcıya gösterilmeli mi?
5. **[Orta] Açık dinamik istemci kaydında oran sınırı ve temizlik yok.** Her POST yeni `client_id` üretiyor (`chatgpt_…`), kimlik doğrulaması yok. Firestore'da sınırsız kayıt birikir; kötüye kullanım ve maliyet açık. Kanıt: yukarıdaki 8×201 yoklaması; `functions/index.js` `chatgptOAuthRegister`. Kontrol: kayıt için IP/oran sınırı, TTL ve kullanılmayan istemcilerin silinmesi var mı?
6. **[Orta] Araç kataloğu (19 araç) kimlik doğrulaması olmadan okunabiliyor.** Veri sızmıyor ama yüzey haritası dışarıya açık; ayrıca `tools/call` için 401 gerçek HTTP 401 değil, JSON-RPC gövdesinde `isError`. Kanıt: yoklama çıktısı; `functions/index.js` `chatgptMcp`. Kontrol: OpenAI bağlayıcı akışı için HTTP 401 + `WWW-Authenticate` başlığı gerekiyor mu (hafızadaki "create app" notu bunu şart koşuyordu)?

## C. Genel görünüm uçları

7. `getPortalForVisitor` ve `getEstimateForVisitor` uydurma token'a **404 "This link is no longer available."** dönüyor — sızıntı yok, mesaj nazik. `nvViewSharedFile` olmayan id'ye 404 HTML sayfası veriyor. `postWebsiteChatMessage` anonim çağrıda `ticketId ve visitorToken zorunlu` diyor. Bu üçü sağlıklı.

## D. Arayüz: Integrations merkezi (web, owner hesabı)

8. **[Yüksek] Hiç bağlanmamış çalışma alanı "Connected 4" gösteriyor; üstteki çip aynı ekranda "0 connected" diyor.** Wix, Squarespace, Zapier, Make kartları "Connected" bölümünde, dördü de "Needs attention". Sebep: bu dördü tek bir inbound webhook kanalını paylaşıyor ve kanal için bir teslimat kaydı varsa durum `connected`/`attention` oluyor (benim reddedilen isteğim yetti). Kullanıcı hiç kurmadığı dört entegrasyonu "bağlı ama bozuk" görüyor. Kanıt: `studioflow-web/lib/studioflow/integrations.ts:305-314`, ekran metni "0 connected · 4 needs attention" ile başlık "Connected 4". Kontrol: webhook kanalı yalnız **başarılı** bir teslimat sonrası "connected" sayılmalı mı; dört kart tek kanalın durumunu paylaşmalı mı?
9. **[Orta] Dört webhook kartı ayırt edilemiyor.** Wix kartına girince başlık "OTHER PLATFORMS · Connect any store with one webhook" ve metin "It works with Wix, Squarespace, **Etsy**, BigCommerce, custom sites and more" diyor. Aynı URL, aynı token, aynı günlük. Ayrıca Etsy'nin native bağlayıcısı varken burada webhook seçeneği olarak anılıyor. Kanıt: Wix kartı içeriği (`studioflow-web/lib/studioflow/integrations.ts` inbound manage bölümü + hub metni). Kontrol: kaynak başına ayrı token/etiket verilecek mi, yoksa tek "Any platform (webhook)" kartına indirilecek mi?
10. **[Orta] Kimlik doğrulama token'ı URL'in içinde.** Kart açıkça söylüyor: "Authentication is the secret token inside the Delivery URL — there is no separate signature header. Treat the URL like a password." Zapier/Make günlükleri, proxy'ler ve tarayıcı geçmişi bu URL'i saklar; sızarsa tek çare "Replace URL". Kanıt: Wix kartı metni; `functions/index.js:19935` (`req.query.token || x-studioflow-token`). Kontrol: başlık tabanlı token (zaten destekliyor) belgelenip önerilsin mi?
11. **[İyi]** Kartın kendi metni dürüst ve iyi yazılmış: `orderId` kimliktir, tekrar teslimat kopya yaratmaz, üretim durumu/tracking ezilmez, iptal/iade durumları sipariş açmaz, para birimi dönüştürülmez, iki ondalık biçimi de okunur, "bizim tarafta otomatik yeniden deneme yok". Token maskeli, "Reveal for 30 seconds" ve "Replace URL" var.
12. **[Orta] QuickBooks kartında son kullanıcıya "Sandbox (test company)" seçeneği sunuluyor.** Gerçek bir kuyumcu bunu seçip hiçbir şeyin senkronlanmadığını göremez. Kanıt: `?section=quickbooks` panelinde "Live company / Sandbox (test company)" radyoları (`studioflow-web/app/settings/QuickBooksIntegrationSection.tsx`). Kontrol: sandbox seçeneği yalnız iç kullanım bayrağı arkasında olmalı mı?
13. **[Orta] Bağlantı hatası mesajı sebebi söylemiyor, yanlış tavsiye veriyor.** `?section=quickbooks&quickbooks=error&reason=missing_code` ile dönünce kırmızı şerit: "QuickBooks could not be connected. Try again in a minute." Sebep (`missing_code`) hiç gösterilmiyor; yapılandırma hatasında "bir dakika sonra tekrar dene" yanlış yönlendirme. Kanıt: aynı bölümün hata şeridi. Kontrol: sebep kodları kullanıcı diline çevrilip gösterilecek mi?
14. **[Düzeltme — önceki rapordaki bulgu geçersiz]** Web kod denetiminin "`?section=paypal` Profile & Security'yi açıyor" bulgusu elle testte doğrulanmadı: `?section=paypal` doğrudan "Integrations / Connect your PayPal account" panelini açtı, `?section=quickbooks` de QuickBooks panelini açtı. Bu maddeyi listeden düşün.
15. **[Orta] "Coming soon" listesi gerçeği yansıtmıyor.** Amazon, **Pandle**, **Stripe**, Google Drive, Dropbox "Not connectable yet" altında. Oysa Pandle'ın canlı bir bağlantı kartı Banking sayfasında var (`components/PandleCard.tsx`), Stripe ise faturalamanın canlı rayı. Kanıt: hub ekranı + `studioflow-web/lib/studioflow/integrations.ts:100-101, 124`. Kontrol: Pandle "banka/muhasebe" kategorisinde canlı gösterilmeli, Stripe "ödeme altyapısı (fatura)" olarak ayrı anlatılmalı mı?
16. **[İyi]** Etsy kartının bağlanmadan önceki ekranı örnek alınacak nitelikte: hangi izin var/yok listesi ("Read authorised sales data · Included", "Edit listings or Etsy checkout · Not allowed"), gizlilik özeti, "Disconnecting does not delete the orders already in NivaDesk" ve Etsy ticari marka uyarısı.

## E. Emülatörde bıraktığım iz

`qa-workspace` içinde: bir başarısız inbound teslimat kaydı; `chatgptOAuthRegister` ile 9 test istemcisi (`chatgpt_…`, hiçbiri onaylanmadı, token alınmadı). Üretimde hiçbir şey değişmedi.

---

# 2) KENDİ DOĞRULAMALARIM — koddan tek tek teyit edilen ek maddeler

Bu bölüm, alt denetimlerden bağımsız olarak benim doğrudan okuduğum yerlerden çıktı.

1. **[Kritik] Mağaza siparişlerinde iade hiçbir kanalda geliri düşürmüyor.** Ortak eşleyicide "refunded" ve "partially_refunded" durumları **ödenmiş** sayılıyor ve ödenen tutar siparişin tamamı yazılıyor; `refundedAmount` alanını ticaret katmanında yazan tek bir satır yok (Square, WooCommerce, Etsy ve Shopify dosyalarında arandı, sıfır sonuç). Yani iade edilmiş bir mağaza siparişi panoda ve kâr raporunda tam tutarıyla gelir olarak durmaya devam ediyor. Bankadan gelen iadeler ise doğru işleniyor, yani model sağlam, mağaza tarafı onu kullanmıyor. · Kanıt: `functions/commerce/envelopeToOrder.js:12` (`PAID_STATUSES` iade durumlarını içeriyor), `:82-90` (`paid = total`, `refundedAmount` yok). · Kontrol: mağaza iadeleri `bankLinkRefundToOrder`'ın kullandığı negatif ödeme girdisi modeline bağlanacak mı?

2. **[Yüksek] "Do not contact" işareti hiçbir gönderimi durdurmuyor.** Müşteri kaydındaki bu alan yalnızca yazılıyor; sunucuda başka hiçbir yerde okunmuyor, durum değişikliği bildirimlerinde (e-posta ve SMS) kontrol edilmiyor. Arayüz bu anahtarı iletişim tercihi gibi sunuyor (işaretlenince iletişim bağlantıları sönüyor), yani kullanıcı korunduğunu sanıyor. · Kanıt: `functions/index.js:13676-13677` (tek kullanım, yazma); `notifyCustomerOnStatusChange` gövdesinde `doNotContact`/`marketingOptIn` araması sıfır sonuç. · Kontrol: otomatik müşteri mesajları bu bayrağa ve pazarlama iznine bakmalı mı?

3. **[Yüksek] SMS ülke kodu her çalışma alanı için varsayılan olarak +44.** Yerel biçimde girilmiş bir numara (0 ile başlayan) bu kodla birleştiriliyor; Türkiye, Almanya veya ABD'deki bir atölyenin müşterisi mesajı hiç almaz, işletme yanlış numaraya ücret öder. · Kanıt: `functions/index.js:25432`, `:25595` (`"44"` sabit varsayılan). · Kontrol: ülke kodu iş yeri adresinden veya müşterinin ülkesinden türetilmeli mi?

4. **[Orta] SMS'te vazgeçme (STOP) kaydı tutulmuyor.** Kaynakta STOP, opt-out veya abonelikten çıkma ile ilgili hiçbir işleme yok. Operatör tarafında STOP çalışsa bile NivaDesk bunu bilmediği için göndermeye devam eder ve teslimat hatası olarak görür. · Kanıt: `functions/index.js` içinde SMS bağlamında `STOP|optOut|unsubscribe` araması sıfır sonuç. · Kontrol: Twilio'nun gelen mesaj webhook'u ile vazgeçme listesi tutulacak mı?

5. **[Orta] Kargo hareketi görülünce sipariş otomatik "sevk edildi" işaretleniyor.** "in transit", "out for delivery", "available for pickup" gibi metinler yakalanınca `isDispatched` doğrudan true yapılıyor. Etiket basılıp iade edilen veya yanlış eşleşen bir takip numarası siparişi yanlışlıkla sevk edilmiş gösterir ve müşteriye durum bildirimi tetikleyebilir. · Kanıt: `functions/index.js:17120-17125`, `:17795-17797`. · Kontrol: geri alma yolu ve "bunu otomatik yapma" seçeneği var mı?

6. **[İyi — doğrulandı] Webhook imzaları doğru kurulmuş.** Shopify uygulama webhook'u ham gövde üzerinden HMAC hesaplayıp zamanlama güvenli karşılaştırıyor; WooCommerce için imza kararı ayrı, test edilebilir bir fonksiyona çıkarılmış ve imza başlığı varken yanlış imza URL token'ı geçerli olsa bile reddediliyor. Zamanlama güvenli karşılaştırma kod tabanında on yerde kullanılıyor. · Kanıt: `functions/index.js:30250-30256`, `:18930-18946`.

7. **[İyi — doğrulandı] Shopify'ın zorunlu gizlilik webhook'ları uygulanmış.** `shop/redact` özyinelemeli silme yapıyor, `customers/redact` ve `customers/data_request` denetim satırı bırakıyor, `app/uninstalled` bağlantıyı pasifleştiriyor. Uygulama izinleri yalnız okuma: sipariş, müşteri, ürün ve karşılama. · Kanıt: `functions/index.js:30764-30900`, `nivadesk-order-management/shopify.app.toml:12, 21-41`.

8. **[İyi — doğrulandı] Portal, teklif ve dosya bağlantı jetonları 24 baytlık rastgele değerler** (192 bit), tahmin edilemez. Özel alan adı doğrulaması sahibe kısıtlı ve alan adı önce çalışma alanına kaydedilmiş olmalı. · Kanıt: `functions/index.js:3552`, `:18659`, `:29896`; `functions/clientDomains.js:273-279`.

9. **[Orta] Genel webhook ucunda oran sınırı, çağrı tavanı ve gövde boyutu sınırı yok.** Fonksiyon yalnız bölge seçeneğiyle tanımlanmış; kimliksiz istekler de tam olarak çalışıp (madde 1'deki günlük yazımı dahil) fatura üretiyor. GET isteği ise 200 ile "uç ayakta, şu parametreler gerekli" diyen yardımcı bir cevap veriyor. · Kanıt: `functions/index.js:19903-19915`. · Kontrol: `maxInstances` ve kaynak başına oran sınırı konmalı mı; kimliksiz istekler faturalanabilir işe dönüşmeden reddedilmeli mi?

10. **[Düzeltme — iki denetim çelişti, kaynaktan karara bağlandı] Jeton şifrelemesinin gerçek durumu.** SMS/hub denetimi "banka, muhasebe, Square ve WooCommerce jetonlarının hiçbiri şifrelenmiyor" dedi; bu **yanlış**. Kaynaktan tek tek doğruladım:
    - **Şifreli (AES-256-GCM, `box`/`unbox`):** Etsy, Shopify, Square (`functions/squareConnector.js:94-95`), WooCommerce (`functions/wooConnector.js:70-71`), QuickBooks ve Xero (`functions/accountingFunctions.js:109-110`, yazımlar `:179, :318, :406`, sağlayıcı başına ayrı anahtar), PayPal uygulama sırrı (`functions/bankFeed.js:1762`).
    - **Düz metin:** TrueLayer banka yenileme jetonu (`functions/bankFeed.js:430-433`) ve Pandle erişim/yenileme jetonları (`functions/pandle.js:140-141`; dosyada tek bir şifreleme çağrısı yok).
    Yani iki gerçek boşluk var, altı bağlayıcıda sorun yok. · Kontrol: bu ikisi de mevcut `encryptToken` yardımcısına bağlanacak mı?

---

# 3) ETSY


Notlar: Aşağıdaki bulgular repoyu doğrudan okuyarak (functions/etsy*.js, commerce/*, integrationOrderFields.js, index.js ilgili bölümleri, firestore.rules, web istemcisi, Swift/Kotlin çağrı noktaları) ve iki paralel alt-inceleme (test/script/doküman taraması + web/native paritesi) ile toplandı. Her satırda dosya:satır kanıtı var; emin olamadıklarım "verify:" ile işaretli.

### A) Akış haritası

1. **Bağlan**: Web/Mac/Android → `beginEtsyConnect` (yalnız owner) → PKCE verifier + tek-kullanımlık `state` → `etsyOAuthStates/{state}` (10 dk TTL) → tarayıcı Etsy'ye gider.
2. Etsy onay/red → `etsyOAuthCallback` (public HTTP, auth yok) → `state` transaction ile bir kez tüketilir → kod PKCE ile değişilir → `/users/{id}/shops` ile mağaza bulunur → `etsyConnections/{companyId_shopId}` yazılır, token'lar AES-256-GCM ile şifreli → tarayıcı `?etsy=connected&shop=...` ile `/settings`e döner.
3. **İlk içe aktarım**: `previewEtsyImport` (yazmaz, dry-run) → satıcı seçer → `runEtsyImport` → her makbuz **tek** fonksiyondan geçer: `applyReceipt()` → plan kapasitesi doluysa `heldIntegrationOrders`a park edilir.
4. `importState="done"` yazılınca otomatik akışların kapısı açılır (`importRules` de saklanır, sonraki her webhook/reconcile bunu uygular).
5. **Sürekli senkron**: `reconcileEtsyConnections` (15 dk, `onSchedule`) `min_last_modified` ile watermark'tan sorar; `syncEtsyNow` bunun manuel eşdeğeri; `etsyWebhook` (order.paid/canceled/shipped/delivered) `resource_url`'i çeker — dördü de aynı `applyReceipt()`'e girer (idempotent: `externalOrderKey` = companyId+shopId+receiptId sabit id, `externalUpdatedAtMs` bayatlık koruması).
6. **Durum nerede yaşıyor**: `etsyConnections` (token+durum+watermark), `etsyOAuthStates`, `etsyExternalOrders` (makbuz↔sipariş eşlemesi), `etsyCustomerLinks` (alıcı↔müşteri kararı), `etsyWebhookEvents` (7 gün dedup), `etsyQuota` (günlük **global** sayaç) — hepsi `allow read,write: if false`.
7. Sipariş dokümanında (`siparisler`) hem normal alanlar hem salt-okunur `etsySource` aynası yazılır; müşteri `musteriler`e `upsertIntegrationCustomer` ile aynalanır.
8. **Sahiplik**: mağaza para+müşteri alanlarını yazar (`INTEGRATION_SHOP_OWNED_FIELDS`), atölye iş akışını yazar — ama `status` (Cancelled/Not Yet) hiçbir listede yok, bu Bulgu 1'in kaynağı.
9. Henüz canlı olmayan "Faz 2" ortak motor (`commerce/engine.js`) aynı akışı gölge modda (`commerceFlags`) tekrar hesaplayıp `commerceShadow`a yazıyor, gerçek siparişe asla dokunmuyor.

### B) Bulgular

1. **[Kritik]** Etsy · İçe aktarıldıktan sonra iptal edilen sipariş asla "Cancelled" olmuyor · Bir alıcı Etsy'de siparişini iptal ederse (veya satıcı iptal ederse) ve sipariş NivaDesk'e zaten aktarılmışsa, ne webhook (`order.canceled`) ne 15 dk'lık mutabakat bunu işler — sipariş "Not Yet"/canlı iş olarak sonsuza dek kalır ve tam tutar gelir sayılmaya devam eder. `includeCancelled:false` (varsayılan) ise makbuz baştan "unsupported/skipped" sayılıp güncelleme hiç çalışmıyor; `includeCancelled:true` ise güncelleme çalışıyor ama `status` alanı sahiplik listesinde olmadığı için patch'ten düşüyor. · Kanıt: functions/integrationOrderFields.js:16-42 (status yok), functions/etsySync.js:410-431 ve 476-479, functions/commerce/engine.js:108,121-128 (yeni motor bunu bilerek özel olarak düzeltmiş — kanıt ki ekip farkında). Test kapsamı doğrulandı: hiçbir test bunu kapsamıyor (functions/test/qa/etsy-mapping.test.js:254-269 ve functions/test/e2e/etsy-emulator.test.js:381-390 sadece "ilk aktarımda zaten iptal" durumunu test ediyor). · Soru: `includeCancelled:true` seçildiğinde `status` alanını da Etsy-owned listesine eklemek + `syncCancellations` benzeri bir carve-out'u legacy yola da taşımak planlanıyor mu?

2. **[Kritik]** Etsy · İade tutarları hiçbir para alanına yansımıyor · `receipt.refunds[]` sadece `source.isRefunded` boolean'ına dönüşüyor; `paidAmount`/`orderValue`/`remainingAmount` iade sonrası da değişmiyor ve review listesine de girmiyor — kısmi/tam iade edilmiş bir Etsy siparişi NivaDesk'te tam fiyatına satılmış gibi görünmeye devam ediyor. `docs/DURUM.md:209-210` "iade davranışı: kusur yok" diyor ama bu satır sadece ŞEMA uygunluğunu (alan isimleri) doğruluyor, para matematiğini değil — `etsy-schema-drift.test.js:62-63`'teki "handled" tanımı da sadece regex ile "refund" kelimesinin kaynakta geçtiğini kontrol ediyor, tutarı değil. · Kanıt: functions/etsy.js:637, 722-723, 865-866; functions/test/qa/etsy-mapping.test.js:186-189 (sadece boolean assert ediliyor). · Soru: iade tutarı `remainingAmount`/negatif ödeme satırı olarak mı işlenmeli, yoksa review kuyruğuna mı düşmeli?

3. **[Kritik]** Etsy · Günlük kota platform-geneli ve manuel yollarda hiç kontrol edilmiyor · `etsyQuota` (5.000/gün) tüm workspace'ler arasında PAYLAŞILAN tek sayaç; sadece zamanlı `reconcileEtsyConnections` süpürmesi %75 tavanında duruyor (functions/etsySync.js:788-802). `previewEtsyImport`, `runEtsyImport`, `syncEtsyNow` hiçbir kota kontrolü yapmıyor (functions/etsySync.js:252-344, 582-676, 745-750) — tek bir müşterinin art arda "Sync now"/önizleme çağırması teorik olarak günlük kotayı tüketip **platformdaki her Etsy bağlantısı için** 429'a yol açabilir. Test yok (agent doğrulaması: functions/test/qa/etsy-sync.test.js:659-676 sadece sayacın arttığını kontrol ediyor, tükenme senaryosunu hiç kurmuyor). · Soru: manuel yollara da bir eşik/rate-limit eklenmeli mi (örn. `etsyCallsToday()` kontrolü)?

4. **[Kritik]** Etsy · Aynı Etsy mağazası iki farklı workspace'e bağlanabiliyor · `etsyOAuthCallback`, yeni bağlantıyı yazmadan önce `externalShopId`'nin BAŞKA bir `companyId` altında zaten bağlı olup olmadığını hiç kontrol etmiyor — bağlantı id'si `companyId_shopId` olduğu için iki workspace aynı gerçek mağazayı bağlayıp her ikisi de aynı siparişleri/müşterileri görebilir. · Kanıt: functions/etsyConnect.js:447-472 (kontrolsüz `set`). Test yok: functions/test/qa/etsy-webhook.test.js:24-66'daki `makeWorld()` hiçbir zaman aynı shop için iki `companyId` seed etmiyor. · Soru: connect anında `externalShopId` için cross-company bir sorgu eklenip "bu mağaza başka bir workspace'e bağlı" reddi mi yapılmalı?

5. **[Kritik]** Etsy · Bulgu 4 gerçekleşirse webhook rastgele workspace'e düşüyor · `etsyWebhook`, hangi workspace'in olayı alacağını `.where("externalShopId","==",shopId).where("status","==","connected").limit(1)` ile buluyor — iki workspace aynı mağazayı bağlamışsa Firestore'un döndürdüğü ilk satır kazanıyor, yani bir müşterinin siparişi rastgele başka bir workspace'e yazılabilir. · Kanıt: functions/etsyWebhook.js:136-140. · Soru: bu senaryo şu an prod'da mümkün mü (kaç workspace connected)?

6. **[Kritik]** Etsy · Atölyenin düzelttiği müşteri bilgisi her otomatik senkronda geri yazılıyor · `etsyCustomerMatch.js`'teki güvenli "boşsa doldur, asla değiştirme" kuralı (`customerPatchForExisting`) hiçbir yerden çağrılmıyor (repo-geneli grep: 0 çağıran). Gerçek yol `index.js`'teki `upsertIntegrationCustomer`, ve `companySettings.integrationCustomerSync` varsayılanı `"store"` (studioflow-web/lib/studioflow/firestore.ts:1310) olduğu için `storeWins=true` — yani her webhook/mutabakat, e-posta/telefon/adres alanlarını atölyenin elle düzelttiği değerin üzerine **koşulsuz** yazıyor. Bu, `etsyCustomerMatch.js`'in kendi yorumundaki tam senaryoyla ("bench'in düzelttiği kargo adresi bir sonraki senkronda kaybolmasın") çelişiyor. · Kanıt: functions/index.js:18532-18545 vs functions/etsyCustomerMatch.js:228-249 (ölü kod). · Soru: varsayılan `integrationCustomerSync` değeri "nivadesk" mi olmalı, yoksa en azından Etsy siparişleri için mi ayrılmalı?

7. **[Kritik]** Etsy · Dashboard, Etsy cirosunu "manual" kanal sayıyor ve döviz alanını hiç okumuyor · `dashboardOrderChannel` yalnız `"shopify"`/`"woocommerce"` tanıyor, her şeyi `"manual"`a düşürüyor; `dashboardOrderCurrency` yalnız `"Shopify Currency"`/`"WooCommerce Currency"`/`"Currency"` okuyor — Etsy'nin yazdığı `customFields["Etsy Currency"]` (functions/etsy.js:774) hiç eşleşmiyor. Sonuç: Etsy geliri kanal filtresinde görünmüyor, çoklu para birimli bir Etsy siparişinin döviz kodu boş dönüyor. Bizzat doğrulandı. · Kanıt: studioflow-web/app/dashboard/page.tsx:177-191; ekibin kendi notu NivaDesk_etsy_ve_yeni_baglantilar.md:222-224. · Soru: bu iki fonksiyona `"etsy"`/`"Etsy Currency"` dalı eklemek ne kadar acil?

8. **[Yüksek, verify]** Etsy · Etsy komisyonu/işlem ücreti hiç modellenmiyor · `paymentFee` her Etsy siparişinde sabit `0`; Etsy'nin transaction/payment-processing/listing ücretleri hiçbir yerde düşülmüyor — kâr hesapları (aktif olarak değiştirilen `functions/finance/engine.js`, `EGGcraft/OrderProfit.swift`) Etsy siparişlerinde kârı olduğundan yüksek gösterir. · Kanıt: functions/etsy.js:753. · Soru: bu Shopify/WooCommerce'de de aynı mı (platform-geneli bilinen bir sınır mı) yoksa Etsy'ye özel bir eksik mi?

9. **[Kritik]** Etsy · Disconnect'in veri-temizleme regresyon testi CI'da hiç çalışmıyor · `etsy-retention.mjs` — sayfalama sınırını aşan (620 sipariş) bir temizleme kusurunu bizzat test eden tek dosya — `functions/package.json`'daki `test`/`test:rules` glob'larına uymuyor (`.mjs` ama `.test.` eki yok), `test/run-e2e.sh` sadece `test/e2e/*.test.js` topluyor, `.github/workflows/functions-tests.yml` yalnız `npm test`, `npm run test:rules`, `test/run-e2e.sh` çalıştırıyor — `test:integration`'ı hiç çağırmıyor. Yani daha önce bir kez yaşanmış "alıcı PII'si disconnect sonrası sonsuza dek kalıyor" hatası sessizce geri gelebilir. · Kanıt: functions/test/qa/etsy-retention.mjs (dosya adı), functions/package.json:19-24, .github/workflows/functions-tests.yml:34-81, functions/test/run-integration.sh:1-9,52. · Soru: bu dosya `test:integration`'a mı taşınmalı yoksa CI'a hermetik hale getirilip eklenmeli mi?

10. **[Yüksek]** Etsy · Token yenileme başarısız olunca `previewEtsyImport`/`runEtsyImport`/`syncEtsyNow` çirkin/ham hata döndürüyor · `verifyEtsyConnection` (functions/etsyConnect.js:513-529) hatayı yakalayıp `{ok:true, healthy:false, reason}` döndürüyor — ama diğer üçü `fetchReceipts`'i hiç try/catch'lemiyor, yakalanmayan `EtsyApiError` Firebase tarafından jenerik "internal" hatasına sarılıyor. Web tarafında bu doğrulandı: `guard()` sarmalayıcısı `actionError.message`'ı DOĞRUDAN kullanıcıya gösteriyor (studioflow-web/app/settings/EtsyIntegrationSection.tsx:238-239), ve `etsyErrorText`'in bilinmeyen kod için `default` dönüşü boş string (studioflow-web/lib/studioflow/etsy.ts:221) — dosyanın kendi başlığındaki "teknik kod asla ekrana çıkmaz" kuralı (satır 11-12) tam bu üç eylemde ihlal ediliyor. · Kanıt: functions/etsySync.js:252-344,582-676,745-750 (try/catch yok). · Soru: bu üçüne `verifyEtsyConnection`'daki desen mi kopyalanmalı?

11. **[Yüksek]** Etsy · Disconnect, Etsy'de token'ı iptal etmiyor ama yorum "revoked at Etsy where possible" diyor · `functions/etsy.js`/`etsyConnect.js` içinde hiçbir revoke çağrısı yok (repo-geneli grep: 0 sonuç); disconnect yalnız yerel şifreli token'ları siliyor. · Kanıt: functions/etsyConnect.js:536-537 (yorum) vs gerçek kod, functions/test/qa/etsy-connect.test.js:411-426 (sadece yerel silmeyi test ediyor). · Soru: Etsy v3 OAuth'un genel kullanıcılara açık bir revoke endpoint'i var mı, yoksa "where possible" zaten "yok" anlamına mı geliyor?

12. **[Yüksek]** Etsy · Müşteri eşleştirme aday sorgusu kaba, skor motoru asla devreye girmeyebiliyor · `loadCustomerCandidates` yalnız tam `externalCustomerId` eşleşmesi veya tam ada göre (`==`) aday çekiyor; `etsyCustomerMatch.js`'in adres/telefon/e-posta puanlayan akıllı `scoreCandidate`'i sadece bu kaba filtreden geçen adaylara bakabiliyor — kargo adındaki küçük bir yazım farkı bile gerçek bir mükerrer müşteriyi "aday" listesine hiç sokmuyor, doğrudan "create" (yeni müşteri) kararına düşüyor. · Kanıt: functions/etsySync.js:221-240 (kaba filtre) besleniyor functions/etsyCustomerMatch.js:88-138'e (ince skor). · Soru: aday havuzu genişletilip (örn. şehir+posta kodu ile de sorgu) skor motoruna daha çok aday mı verilmeli?

13. **[Yüksek]** Etsy · `etsySource` panelini hiçbir istemci göstermiyor · Sunucu her siparişe salt-okunur Etsy aynasını (`etsySource`) yazıyor ama web, Mac/iPhone, Android — üçünde de bu alanı okuyan/çizen kod yok (üçlü grep: web'de 0, `EGGcraft/EtsyIntegration*.swift`'te 0, Android kaynağında 0 sonuç; Shopify'ın eşdeğeri `ShopifyOrderSourceStrip` üç yerde çizilmişken Etsy'ninki hiç yok). Ekibin kendi notu bunu doğruluyor. · Kanıt: NivaDesk_etsy_ve_yeni_baglantilar.md:216-218; doğrulama: `grep -rn etsySource studioflow-web`, EGGcraft, studioflow-android/app/src → hepsi 0. · Soru: bu panel roadmap'te mi, yoksa terk mi edildi?

14. **[Yüksek]** Etsy · Mac/iPhone sipariş kaydı `etsySource`'u siliyordu — düzeltme commit edilmemiş görünüyor · Doküman bunu bilinen hata olarak listeliyor (`setData(from:)` merge'süz); `docs/DURUM.md:1887` (3 Eyl gecesi) bunun düzeltildiğini, `etsySource`/`commerce`/`createdAt` alanlarının artık hayatta kaldığını söylüyor — ama bu oturumun git durumu `EGGcraft/Siparis.swift`i **değişmiş ama commit edilmemiş** gösteriyor. · Kanıt: NivaDesk_etsy_ve_yeni_baglantilar.md:219-221, docs/DURUM.md:1887, (bağlam: git status `M EGGcraft/Siparis.swift`). · Soru: düzeltme mağaza sürümüne gitti mi, yoksa hâlâ yerel çalışma ağacında mı?

15. **[Yüksek]** Etsy · Rol kapısı gevşek: finans göremeyen üye alıcı adı+tutarı önizlemeden okuyabiliyor · `previewEtsyImport` ve `syncEtsyNow` yalnız `requireWorkspaceMember` çağırıyor, `requireWorkspaceAreaAccess` hiç yok — bu ekibin kendi dokümanında da itiraf edilmiş bilinen bir açık. · Kanıt: functions/etsySync.js:253,746; NivaDesk_etsy_ve_yeni_baglantilar.md:225-227. · Soru: finans görünürlüğü olmayan roller bu workspace'lerde gerçekten var mı (etkinin büyüklüğü)?

16. **[Yüksek]** Etsy · Disconnect ekranı, sunucunun gerçekte yaptığının tersini söylüyor · Ekranda "Disconnecting does not delete the orders" doğru ama hemen altında "Deleting imported Etsy source data is a separate request and is not available yet. Disconnecting never deletes anything from Etsy." yazıyor — oysa sunucu `disconnectEtsyShop` her disconnect'te `etsySource`'u ve `etsyCustomerLinks`'i gerçekten siliyor (test edilmiş: functions/test/qa/etsy-retention.mjs:66-73). Kullanıcıya/uyum incelemesine yanlış bilgi veriyor. · Kanıt: studioflow-web/app/settings/EtsyIntegrationSection.tsx:863 vs functions/etsyConnect.js:576-636. · Soru: bu metin ne zaman, hangi özellikten önce yazılmış — güncellenmesi mi unutuldu?

17. **[Orta]** Etsy · `purgeComplete`/`etsyDataCleared` dürüst sinyali web arayüzüne hiç ulaşmıyor · Sunucu disconnect sonrası temizliğin tam bitip bitmediğini (`purgeComplete`) döndürüyor ama `studioflow-web/lib/studioflow/etsy.ts:131-136`'daki TS tipi bu alanları hiç tanımlamıyor, ve `EtsyIntegrationSection.tsx`'te bu iki alan için 0 kullanım var (grep doğrulandı). · Kanıt: studioflow-web/lib/studioflow/etsy.ts:131-136 vs functions/etsyConnect.js:638. · Soru: büyük bir mağazada `purgeComplete:false` gerçekleşirse kullanıcı bunu hiç görmeyecek mi?

18. **[Yüksek]** Etsy · Şema kayması tespiti tamamen elle · `refresh-etsy-schema.sh`'ı çağıran hiçbir CI/cron/başka script yok (repo-geneli grep: 0 çağıran) — `etsy-schema-drift.test.js` her push'ta çalışıyor ama yalnız COMMIT EDİLMİŞ fikstüre (`test/fixtures/etsy-receipt-schema.json`, son yenileme 2026-08-31) karşı kıyaslıyor; Etsy canlıda bir alanı yeniden adlandırırsa, biri elle scripti çalıştırana kadar CI bunu asla göremez. · Kanıt: functions/scripts/refresh-etsy-schema.sh:1-19, functions/test/qa/etsy-schema-drift.test.js:10-13. · Soru: bu script'i haftalık bir GitHub Actions cron'una bağlamak mümkün mü?

19. **[Yüksek]** Etsy · Sessiz alan değişikliğinde ilk kırılan şey: siparişler £0 ile, hatasız içe aktarılır · `etsyMoney(null)` tasarım gereği `{value:0,currency:""}` döndürüyor; `normalizeEtsyReceipt`'te yeniden adlandırılmış bir alana karşı hiçbir varlık kontrolü yok — `grandtotal`/`buyer_user_id`/`transactions` yeniden adlandırılırsa sipariş sıfır tutarla veya kalemsiz sessizce girer, tek sinyal bir satıcının fark etmesi. · Kanıt: functions/etsy.js (etsyMoney), functions/test/qa/etsy-mapping.test.js:70,272-277 (sadece "eksik alan çökmez" test ediliyor, "yeniden adlandırılmış alan" değil). · Soru: kritik alanlar için (`grandtotal`, `buyer_user_id`) bir "beklenmedik şekilde eksik" review kodu eklenebilir mi?

20. **[Orta]** Etsy · Webhook imza şeması hiç gerçek Etsy teslimatına karşı test edilmemiş · `etsy-core.test.js`/`etsy-webhook.test.js` kendi ürettiği HMAC'lenmiş gövdelerle test ediyor; receipts için uygulanan "gerçek şemaya karşı test et" disiplini (schema-drift) webhook zarfı/imza formatına hiç uygulanmamış. · Kanıt: functions/test/qa/etsy-core.test.js:85-170, functions/test/qa/etsy-webhook.test.js:16-22. · Soru: Etsy Webhook Portal'dan gerçek bir test teslimatı yakalanıp fikstür olarak eklenebilir mi?

21. **[Yüksek]** Etsy · `runEtsyImport`'un kısmi hata testi gerçek döngüyü hiç çalıştırmıyor · `etsy-sync.test.js:290-304`, `applyReceipt`'i monkey-patch'liyor ama kendi yorumu "runEtsyImport kendi referansını tutuyor, bu yüzden applyReceipt'i doğrudan çağır" diyor — yani gerçek `runEtsyImport` döngüsüne hiç dokunmadan, eksik parametreli bir çağrının reddini test edip `assert.ok(true)`'da bitiyor. Dosyanın kendi başlığındaki dört kabul kriterinden biri ("kısmi bir aktarım hatalarını kaybetmeden raporlar") fiilen doğrulanmıyor. · Kanıt: functions/test/qa/etsy-sync.test.js:290-304. · Soru: gerçek `runEtsyImport` çağrısıyla 3 makbuzdan 1'i başarısız olduğunda diğer ikisinin commit olduğu mu test edilmeli?

22. **[Orta]** Etsy · `releaseHeldIntegrationOrders` yalnız `SHOPIFY_TOKEN_KEY` secret'ına bağlı, ETSY_* secret'ları yok · Bugünkü Etsy dalı (index.js:14387-14431) zaten alınmış makbuzu tekrar oynattığı için canlı bir Etsy çağrısı yapmıyor, o yüzden şu an kırık değil — ama bu, `reconcileEtsyConnections`'ı bir kez sessizce öldürmüş olan **aynı** "secret bağlanmadı" desenidir (docs/DURUM.md:205-206'da ekibin kendi itirafı). Bu yolun ileride Etsy'yi canlı çağırması gerekirse (örn. tazelenmiş veri için), hata secret eklenene kadar sessiz kalır. · Kanıt: functions/index.js:14318 (`secrets:[SHOPIFY_TOKEN_KEY]`) vs functions/index.js:5819-5824 (Etsy'nin diğer tüm fonksiyonları 3 ETSY_* secret'ını bağlıyor). · Soru: bu bilinçli mi yoksa gözden mi kaçtı?

23. **[Orta]** Etsy · Pazarlama sitesi hâlâ "Zapier ile bağlanır" diyor · Gerçek bağlantı native OAuth iken, herkese açık site 11 dilde ve FAQ JSON-LD'sinde Etsy'yi hâlâ Zapier/webhook tabanlı anlatıyor — potansiyel müşteriye ve arama motoru/AI tarayıcılara yanlış bilgi. · Kanıt: NivaDesk_etsy_ve_yeni_baglantilar.md:233-234 (ekibin kendi notu). · Soru: site metni + JSON-LD ne zaman güncellenecek?

24. **[Yüksek, verify]** Etsy · KDV/vergi alanları Etsy'nin "deemed marketplace supplier" VAT'ını ayırt etmiyor · `taxAmount = total_tax_cost + total_vat_cost` olarak toplanıyor; Etsy'nin AB/UK kurallarına göre bazı satışlarda VAT'ı satıcı adına doğrudan vergi dairesine ödediği (satıcının hiç görmediği) durumlar var — bu ayrım hiçbir yerde yok, bu da satıcının kendi VAT beyanına Etsy'nin zaten ödediği bir tutarı dahil etmesine yol açabilir. Kodda bu ayrıma dair hiçbir iz yok (grep: 0). · Kanıt: functions/etsy.js:622-623,758. · Soru: NivaDesk'in VAT raporu bu satırı nasıl kullanıyor — muhasebeci ile teyit gerekir.

25. **[Orta]** Etsy · `admin` rolü mağaza bağlayamıyor, kod yorumu "owner/admin" diyor · `requireWorkspaceOwner` yalnız `ownerUid`'i kabul ediyor; bu ekibin kendi bilinen-boşluk listesinde. · Kanıt: NivaDesk_etsy_ve_yeni_baglantilar.md:228-229, functions/etsyConnect.js (requireWorkspaceOwner enjekte edilen `requireWorkspaceForBilling(request,true)` → functions/index.js:2672-2674 `uidIsCompanyOwner` kontrolü). · Soru: admin'in de bağlayabilmesi ürün kararı mı, yoksa düzeltilecek bir hata mı?

26. **[Orta]** Etsy · Önizleme plan kapasitesini hiç kontrol etmiyor · `previewEtsyImport` "ready: 500" gösterebilir ama `runEtsyImport` sırasında bunların bir kısmı plan limiti yüzünden sessizce "held" olabilir — önizlemede hiçbir uyarı yok. · Kanıt: functions/etsySync.js:252-344 (kapasite kontrolü yok) vs functions/etsySync.js:451-466 (`applyReceiptLive` içinde var). · Soru: önizlemeye "bunlardan N tanesi plan limitinizi aşıyor" satırı eklenebilir mi?

27. **[Orta]** Etsy · Önizleme, sıralı (batch'siz) Firestore okumaları yapıyor — büyük mağazada zaman aşımı riski · Her makbuz için `externalOrders().doc(key).get()` + `existingLinkFor` + (gerekirse) `loadCustomerCandidates`'ın 2 sorgusu **sıralı `await`** ile çalışıyor; 500 makbuzda 1000-2000 ardışık okuma, 300 saniyelik zaman aşımına yaklaşabilir. · Kanıt: functions/etsySync.js:270-325 (döngüde `Promise.all` yok). · Soru: büyük bir gerçek mağazada (`sinceDays`=730, yoğun satış) `previewEtsyImport` gerçekten zaman aşımına uğradı mı?

28. **[Orta]** Etsy · 500'den fazla makbuzu olan mağazalar için sunucu tarafında ilerleme/sayfalama yok · `MAX_PREVIEW_RECEIPTS=500` her çalıştırmayı sınırlıyor, `truncated` bayrağı dönüyor ama devam eden bir imleç/parça-parça geri doldurma mekanizması yok — satıcı `sinceDays`'i elle daraltmak zorunda. · Kanıt: functions/etsySync.js:23-24,260-265,595-599. · Soru: web arayüzü `truncated` durumunda satıcıya ne öneriyor (agent'ın web bulgularıyla teyit edilmeli)?

29. **[Orta]** Etsy · Kota sayacı gerçek kullanımı eksik sayıyor · `recordEtsyCalls` yalnız `fetchReceipts` içinden çağrılıyor; token yenileme (`refreshAccessToken`), OAuth-anı mağaza aramaları, ve `verifyEtsyConnection`'ın `/users/me` çağrısı hiç sayılmıyor — "bugün X/5000 kullanıldı" iç göstergesi gerçek Etsy tarafı kullanımını hep düşük gösteriyor. · Kanıt: functions/etsyConnect.js:193,246-256,517 (hiçbiri `recordEtsyCalls` çağırmıyor) vs functions/etsySync.js:104-116,174. · Soru: bu sapma pratikte %75 tavanını ne kadar etkiliyor (bağlı mağaza sayısına bağlı)?

30. **[Orta]** Etsy · Eşzamanlı manuel senkronlar arasında global bir QPS/eşzamanlılık kilidi yok · `ETSY_MIN_CALL_GAP_MS=220ms` yalnız TEK bir `fetchReceipts` döngüsü içinde sıralamayı sağlıyor; farklı workspace'lerden aynı anda gelen birden çok `syncEtsyNow`/`previewEtsyImport` çağrısı arasında paylaşılan bir hız sınırlayıcı yok. · Kanıt: functions/etsy.js:51-55 (sabitler), functions/etsySync.js (global semafor yok). · Soru: 429 sonrası geri çekilme (mevcut, iyi tasarlanmış) bunu pratikte yeterince yumuşatıyor mu?

31. **[Orta]** Etsy · Webhook imza-teşhis kısıtlaması örnek-bazlı (in-memory), global değil · `lastDiagnosisMs`, tek Cloud Functions örneğinde tutulan bir değişken — yatay ölçeklenmede yeni başlayan her örnek "10 dakikada bir" sınırını sıfırdan sayıyor, "bir yabancının bunu istediği kadar tetikleyebilmesi" riskini azaltsa da tam kapatmıyor. · Kanıt: functions/etsyWebhook.js:31-32,84. · Soru: bu Firestore'da paylaşılan bir sayaca mı taşınmalı?

32. **[Orta]** Etsy · E-postası olmayan misafir alıcılar için özel bir inceleme bayrağı yok · `no_buyer_id` işaretleniyor ama sadece e-postası boş (buyer_id var) siparişler için ayrı bir review kodu yok — bu sipariş sessizce boş e-postayla içe aktarılıyor. · Kanıt: functions/etsy.js:693-695 (yalnız `no_buyer_id` push ediliyor). · Soru: bu, e-posta bildirimi gönderen başka bir akışı (sipariş onayı vb.) etkiliyor mu?

33. **[Orta]** Etsy · Uzun süreli `needs_reconnect` sonrası birikinti yavaş kapanıyor, ilerleme görünmüyor · Mutabakat sayfa başı en fazla 100 makbuz işliyor (15 dk'da bir); satıcı yeniden bağlandıktan sonra büyük bir geri-birikim varsa saatlerce sürebilir, ilerleme yalnız sunucu loglarında (`console.log`), kullanıcıya görünen bir gösterge yok. · Kanıt: functions/etsySync.js:685-743,788-826. · Soru: uzun süre kopuk kalmış bir mağazanın yeniden bağlanma sonrası kaç sweep'te tam kapandığı ölçüldü mü?

34. **[Orta]** Etsy · Yarım kalan disconnect temizliği hiç yeniden denenmiyor · Temizlik 40 sn / 500 belge bütçesiyle en-iyi-çaba; 620 siparişe kadar test edilmiş ve çalışıyor (functions/test/qa/etsy-retention.mjs:98-131) ama bütçe aşılırsa (`purgeComplete:false`) ve satıcı bir daha hiç bağlanmazsa, kalan Etsy verisi süresiz kalıyor — kod yorumundaki "reconnect'te süpürülür" iddiası ancak fiilen yeniden bağlanılırsa gerçekleşiyor, arka planda otomatik bir devam işi yok. · Kanıt: functions/etsyConnect.js:576-636. · Soru: çok büyük (>birkaç bin sipariş) bir mağazada bu bütçe aşılır mı, ölçülmüş mü?

35. **[Orta]** Etsy · `commerce/capabilities.js` Etsy için ürün/envanter "okunabilir" diyor ama hiç kod bunu yapmıyor · Kayıt `products:{read:true}`, `inventory:{read:true}` diyor; repo genelinde Etsy `/listings` API'sine tek bir çağrı yok (grep: 0) — bu, uygulanmamış/özlem duyulan bir yetenek girdisi, "liste → envanter" eşleştirmesi audit talebinde beklenen ama mevcut olmayan bir özellik. · Kanıt: functions/commerce/capabilities.js:22-24 vs functions/etsy.js (802: "biz listeleri göstermiyoruz" — bilinçli tercih). · Soru: bu kayıt "gelecekte" anlamında mı bırakıldı, düzeltilmeli mi?

36. **[Düşük]** Etsy · `etsyConnectionId`siz eski "held" siparişler, çok-mağazalı workspace'te sonsuza dek tutulu kalabilir · `releaseHeldIntegrationOrders`, connectionId'siz eski kayıtlarda "tam 1 bağlı mağaza varsa" tahmin ediyor; 2+ mağaza varsa belirsiz kabul edip dokunmuyor (bilinçli, güvenli tasarım ama sessiz). · Kanıt: functions/index.js:14400-14418. · Soru: bu tür eski (etsyConnectionId'siz) kaç kayıt var?

37. **[Orta]** Etsy · Tek-uçuşlu (single-flight) token yenileme kilidi gerçek çapraz-örnek Firestore transaction çekişmesi altında test edilmemiş · `etsy-connect.test.js:250-273`'teki eşzamanlılık testi gerçek ama aynı process içinde (`Promise.all`+sahte `setTimeout`); dört e2e dosyasından hiçbiri token yenilemeyi gerçek emülatöre karşı test etmiyor. · Kanıt: functions/etsyConnect.js:156-161, functions/test/qa/etsy-connect.test.js:88-96,250-273. · Soru: gerçek iki Cloud Functions örneğinin aynı anda yenilemeye çalıştığı bir e2e senaryosu eklenebilir mi?

38. **[Orta]** Etsy · QA paketinde üç bağımsız, elle yazılmış sahte Firestore var — biri diğerinin bulduğu açığı otomatik kapatmıyor · `etsy-webhook.test.js`'in sahte `.limit()`'i asla kırpmıyor (gerçek Firestore'un "rastgele satır kazanır" davranışını asla üretemez — bu yüzden Bulgu 4/5 hiçbir testte yeniden üretilemiyor), `etsy-sync.test.js`'in sahte `where()`'i her zaman boş dönüyor. · Kanıt: functions/test/qa/etsy-webhook.test.js:44-64, functions/test/qa/etsy-sync.test.js:38-68 (kendi bulgusu, bağımsız doğrulandı: `find functions/test -iname "*fake*"` → paylaşılan bir yardımcı yok). · Soru: paylaşılan tek bir sahte-Firestore yardımcısına geçmek roadmap'te mi?

39. **[Düşük]** Etsy · TTL yalnız uygulama-kodu karşılaştırmasıyla test edilmiş, gerçek Firestore TTL politikası değil · `etsyOAuthStates`'in 10 dk'sı ve `etsyQuota`'nın günlük anahtar değişimi, testte mock `now()` ilerletilerek doğrulanıyor; gerçek TTL politikasının prod Firestore'da açık/doğru alan üzerinde olup olmadığı kod okumasıyla doğrulanamaz. · Kanıt: functions/etsyConnect.js:275-279 (hem `expiresAt` hem `expireAt`), functions/test/qa/etsy-connect.test.js:107,214-224. · Soru [verify]: Firestore konsolunda `etsyOAuthStates.expireAt` ve `etsyWebhookEvents.expireAt` için TTL politikası fiilen etkin mi?

40. **[Orta]** Etsy · `releaseHeldIntegrationOrders`'ın Etsy dalı için hiç Etsy-özel testi yok · Repo genelinde bu fonksiyonu tetikleyen testler yalnız plan-downgrade/shopify/inbound senaryolarını sürüyor; `etsy-sync.test.js:269-278` yalnız "tutma" (hold) tarafını test ediyor, serbest bırakma/replay tarafını değil. · Kanıt: functions/test/qa/etsy-sync.test.js:269-278, functions/index.js:14387-14431 (uygulama, testsiz). · Soru: bu, Bulgu 22'deki secret-eksikliği senaryosuyla birlikte mi ele alınmalı?

41. **[Düşük]** Etsy · `load-etsy-key.sh` iyi hijyenli ama keşfedilemez · Değer asla ekrana basılmıyor, şekil doğrulanıyor (24 karakter keystring), kaydetmeden önce Etsy'ye pinglenip doğrulanıyor — ama repo genelinde bu script'e başka hiçbir yerden (README, CI, başka script) referans yok; rotasyon tamamen "birinin bu dosyayı hatırlaması"na bağlı. · Kanıt: functions/scripts/load-etsy-key.sh:1-68 (tam okundu, harici çağıran bulunamadı). · Soru: bu adımlar bir README'ye veya onboarding belgesine taşınmalı mı?

42. **[Düşük, verify]** Etsy · Yenileme token'ının kendi 90 günlük ömrü hiç izlenmiyor · Bağlantı dokümanında yalnız erişim token'ının (`tokenExpiresAt`, 1 saat) süresi tutuluyor; yenileme token'ının yaşı için alan yok. Sessiz bir mağaza + uzun süreli kota tükenmesi/`MAX_CONNECTIONS_PER_SWEEP=25` kısıtı bir araya gelirse (düşük olasılık, bileşik senaryo), 90 gün boyunca hiç yenilenmeyen bir refresh token Etsy tarafında sessizce ölebilir. · Kanıt: functions/etsyConnect.js (bağlantı alanlarında `refreshTokenAge` benzeri bir alan yok), functions/etsySync.js:28 (`MAX_CONNECTIONS_PER_SWEEP=25`). · Soru: platform büyüdükçe (>100 bağlı mağaza) bu sırayla taranma sıklığı ölçülüyor mu?

43. **[Düşük, verify]** Etsy · Şema-kayması testinin regex taraması, `normalizeEtsyReceipt` gövdesinin yalnız ilk 12.000 karakterini okuyor · Fonksiyon+yorumların toplam uzunluğu ölçüldü: ~13.146 karakter — teknik olarak sınırı aşıyor. İncelemede, kesim noktasından sonraki kod yalnız daha önce zaten taranmış değişkenleri (`addressParts`, `buyerId`) yeniden kullanıyor, yani şu an için yeni bir alan adı kaçırılmıyor gibi görünüyor — ama fonksiyon büyüdükçe kırılgan. · Kanıt: functions/test/qa/etsy-schema-drift.test.js:28 (`body = SOURCE.slice(start, start+12000)`), functions/etsy.js:606-887 (fonksiyonun gerçek uzunluğu). · Soru: bu sınırı fonksiyonun gerçek sonuna kadar genişletmek (sabit sayı yerine) daha güvenli olmaz mı?

44. **[Düşük]** Etsy · İzin kapsamları (scope) yeterli, uygulanmayan bir uç noktaya bağımlılık yok · Kod yalnız `transactions_r`/`email_r`/`shops_r` gerektiren uç noktaları çağırıyor (receipts, shop lookup, buyer email) — reddedilen başvuru sonrası Seller App yerine standart Personal/Commercial app olarak kalınması (docs/DURUM.md:212-217, Etsy personelinin "Seller App + Personal App aynı anda olamaz" açıklaması) bu kapsam setiyle tutarlı; tek uyuşmazlık Bulgu 35'teki (products/inventory) aşırı-iddialı yetenek kaydı. · Kanıt: functions/etsy.js:44 (ETSY_SCOPES), docs/DURUM.md:212-217. · Soru: yok — bilgilendirme amaçlı, olumlu bir doğrulama.

---

**Genel değerlendirme**: OAuth/PKCE/state, token şifreleme, Firestore kuralları ve idempotent makbuz-eşleme çekirdeği sağlam ve iyi test edilmiş (`etsy-core.test.js`, `etsy-rules.test.mjs`, `etsy-connect.test.js` gerçek/güçlü testler). Asıl risk kümesi üç yerde toplanıyor: **(1)** ilk-aktarım sonrası durum değişikliklerinin (iptal, iade) hiç geri yayılmaması — bu para/işlem doğruluğunu doğrudan bozuyor; **(2)** paylaşılan global kotanın hem hesaplanışının eksik hem de manuel yollarda hiç korunmasız olması — platform-geneli kesinti riski; **(3)** çok-workspace izolasyonunun connect anında hiç doğrulanmaması. `docs/DURUM.md:202-217`'ye göre OAuth akışı gerçek Etsy'de yalnız 31 Ağustos'ta ilk kez, bir kez çalıştırıldı; makbuz/senkron tarafı henüz gerçek bir alıcı siparişiyle production'da hiç doğrulanmadı ("receipts yarısı gerçek alıcı istiyor") — yani yukarıdaki bulguların çoğu şu ana kadar gerçek trafikle hiç sınanmamış kod yollarında.

---

# 4) SHOPIFY · WOOCOMMERCE · GENEL WEBHOOK (Wix/Squarespace/Zapier/Make)


Üç paralel derin-inceleme ajanı (Shopify, WooCommerce, paylaşılan motor+inbound) artı kendi doğrudan doğrulamalarımla (firestore.rules, functions/commerce/* tüm dosyalar, integrationOrderFields.js, resyncIntegrationCustomer, GDPR işleyicileri, wooConnector.js:230-330) çapraz kontrol edilmiş sonuçlar. Ajanlardan biri (paylaşılan motor) `wooConnector.js` dosyasını hiç okumadığı için "WooCommerce motoru hiç kullanmıyor" sonucuna vardı — kendi doğrudan okumamla bunun yanlış olduğunu kanıtladım (bkz. Bulgu #33) ve raporu buna göre düzelttim. Referans mimari dokümanı (`NivaDesk_shopify_woocommerce.md`, 1 Eylül tarihli) en az 6 noktada güncel kodla çelişiyor — hepsi "iyi haber, zaten düzeltilmiş" yönünde (INB-006, TEST-016 gibi bilet numaralı düzeltmeler 1-2 Eylül'de yapılmış); bu çelişkiler ayrı ayrı işaretlendi, tekrarlanmadı.

### A) Akış haritası

1. **Shopify kurulum:** App Store'dan kurulum → OAuth (`afterAuth`) → offline token `shopifyStores/{shop}.accessToken` (düz metin + Faz-A ikili-yazım şifreli kopya) → embedded iframe Firebase Auth'u güvenilir çalıştırmadığından, "Connect" 15 dk'lık nonce basar, `nivadesk.app/connect/shopify` yeni sekmede açılır, workspace seçilir, `shopifyCompleteConnect` nonce'u tüketip `companyId`'yi bağlar.
2. **Shopify webhook:** 12 konu + 3 GDPR ucu doğrudan `shopifyAppWebhook`'a gider → HMAC (ham gövde, timing-safe) → event-id `create()` ile tekilleştirme (atomik) → `routeShopifyAppTopic` mağaza filtreleri/iş akışı kurallarıyla siparişi yazar.
3. **Shopify güncelleme:** Var olan sipariş için eşleyici TEKRAR ÇALIŞMAZ — sadece ödeme durumu/toplam/iptal yamanır; motor (engine.js) SADECE gölge modda (dev mağaza bayrağı) karşılaştırma için çalışır, hiç yazmaz.
4. **Shopify faturalandırma:** Shopify Billing API ($12/$25/$65, USD) → `applyShopifySubscription` hem onay dönüşünde hem `app_subscriptions/update` webhook'unda idempotent çalışır; Stripe/Apple/Google ile çapraz-ray engeli iki yönlü.
5. **Shopify kaldırma:** `app/uninstalled` token+oturumu siler, `companyId`'yi SİLMEZ (yeniden kurulum otomatik devam eder); `shop/redact` ~48 saat sonra tüm `shopifyStores/{shop}` ağacını `recursiveDelete` ile siler; `customers/redact` sadece kaynağı Shopify olan sipariş/müşteri kayıtlarını anonimleştirir, finansal toplamlara dokunmaz.
6. **WooCommerce bağlantı:** Mağaza URL'i → SSRF/özel-IP kontrolü (SADECE bu anda) → `wc-auth/v1/authorize` yönlendirmesi → Woo, consumer key/secret'ı `wooAuthCallback`'e POST'lar (tek kullanımlık 10 dk state) → `finishWooConnect` anahtarları önce REST API'ye karşı doğrular (`client.probe()`) → 5 webhook oluşturulur (`ensureWebhooks`, dedupe'li).
7. **WooCommerce sipariş:** `wooConnectorWebhook` URL token + HMAC imzasını ikisini de zorunlu kılar → siparişi webhook gövdesinden DEĞİL, REST API'den yeniden çeker → **gerçekten `commerce/engine.js`'i `mode:"apply"` ile çağırır** (WOO-010 taksit-birleştirme kısayolu hariç, o motoru hiç atlar).
8. **WooCommerce mutabakat:** 15 dk'lık zamanlanmış `reconcileWooConnections` + manuel `syncWooNow`/`previewWooImport`/`runWooImport`/`auditWooOrders` webhook'un kaçırdığını yakalar; deterministik `woo_{cid}_{orderId}` kimliğiyle tekilleştirilir.
9. **WooCommerce kesme:** `disconnectWooShop` 5 webhook'u ve şifreli kimlik bilgilerini siler, içe aktarılmış siparişleri dokunmadan bırakır.
10. **Inbound (Zapier/Make/Wix/Squarespace):** `getInboundWebhookToken` workspace başına token basar (`companies/{cid}/integrationSecrets/inbound`) → tek teslimat URL'i paylaşılır → her POST: `companyId` var mı (400) → şirket var mı (404) → token `timingSafeEqual` (401) → kapasite kontrolü (üzerindeyse `heldIntegrationOrders`'a park, 200) → `mapGenericInboundOrderToSiparis` doğrudan `siparisler`'e yazar.
11. **Kritik mimari nokta:** Üç kanal, paylaşılan motorun (`commerce/engine.js`) üç FARKLI göç aşamasında: WooCommerce motoru CANLI kullanıyor (sıra-dışı/tekrar koruması dahil); Shopify sadece gölgede karşılaştırıyor (canlı yol hâlâ eski bespoke kod); Inbound motora hiç dokunmuyor (kendi eski-tarz doğrudan yazım kodu).
12. **Ortak alan sahipliği:** `integrationOrderFields.js`'in `INTEGRATION_SHOP_OWNED_FIELDS` (21 alan) listesi hem eski mağaza-eşleyicileri hem yeni `commerce/ownership.js` (23 NivaDesk-sahipli alan, birinciyi import ederek — kopyalamadan) tarafından paylaşılıyor; TEK istisna resmi Shopify uygulamasının kendi elle yazılmış dar yaması.
13. **Para:** `commerce/money.js` ondalık-string kanonik format kullanıyor (float değil); hiçbir yerde döviz çevrimi yok — mağazanın kendi para birimi olduğu gibi saklanıyor (bilinçli tasarım).
14. **Held-order kurtarma:** `releaseHeldIntegrationOrders` sağlayıcıya göre dallanıyor: Shopify dalı (MERGE-006) `applyShopifyOrderEvent`'i tekrar çalıştırıyor (filtre/kural dahil); WooCommerce dalı hâlâ çıplak eski eşleyiciyi çağırıyor (taksit birleştirme ve motor damgası atlanıyor); tanınmayan sağlayıcı artık silinmiyor, park edilmiş bırakılıyor (TEST-016, geçmişte gerçek Etsy siparişi yemişti).

### B) Bulgular

1. **[Kritik] Woo · SSRF/DNS-rebinding: özel-IP kontrolü sadece bağlanma anında, sonra hiç tekrarlanmıyor.** Mağaza sahibi/DNS'i kontrol eden biri bağlantıyı geçirip sonra alan adını `169.254.169.254` (GCP metadata) veya iç ağa çevirirse, 15 dakikalık zamanlanmış mutabakat sonsuza dek bu adrese kimlik doğrulamalı istek atar. Kanıt: `functions/commerce/woo/url.js:26` (`isPrivateAddress`), tek çağrı yeri `wooConnector.js:107`; `commerce/woo/client.js`'in `request()`'i hiç yeniden doğrulamıyor. Kontrol edilecek: Cloud Function'ın egress/servis hesabı kapsamı gerçek etkiyi ne kadar büyütüyor.

2. **[Kritik] Inbound · Refund/kısmi iade hiçbir yerde `paidAmount`/`remainingAmount`'ı düşürmüyor.** `envelopeToOrder.js:12,82-83`: `PAID_STATUSES` "refunded"/"partially_refunded"yi de "paid" gibi sayıyor, `envelope.refunds` dizisi hiç okunmuyor. Bu DAVRANIŞ TESTLE KİLİTLENMİŞ: `test/e2e/commerce-engine-emulator.test.js:98` kısmi iade sonrası `paidAmount===50` (tam tutar) bekliyor. Aynı desen resmi Shopify yolunda da var (`index.js:30658-30661`, blanket "refunded" damgası, tutar düşürülmüyor). Bu rakam `functions/finance/engine.js:264,296`'daki `netProfit` hesabına akıyor — Dashboard, toolbar marjı ve Swift/Android aynaları etkileniyor. Kontrol edilecek: banka-iade eşleştirme özelliği bunu ayrı bir yolda telafi ediyor mu, yoksa sadece nakit akışını mı düzeltiyor (kâr rakamını değil).

3. **[Yüksek] Inbound · Legacy `inboundWebhookToken`, göç etmemiş workspace'lerde `companies/{id}` belgesinde düz metin; viewer/workflow-only dahil her rol SDK'dan doğrudan okuyabiliyor.** `readIntegrationSecret` (`index.js:18632-18651`) önce kilitli `integrationSecrets/inbound` alt koleksiyonuna bakıyor, yoksa eski alana düşüp göç ediyor — ama bu göç TEMBEL (ilk gerçek kullanımda), proaktif bir yedek-doldurma (backfill) yok. `firestore.rules:35-42` (`canReadCompany`) owner/admin/member/viewer/workflow/workflowOnly hepsine tüm belge okumasını veriyor; `protectedBillingFields()` (`rules:322-327`, `inboundWebhookToken` dahil) sadece YAZMAYI engelliyor. Shopify/Woo tokenları artık ölü uçlara bağlı olduğu için önemsiz ama "inbound" hâlâ canlı. Kontrol edilecek: bu göç mekanizması ne zaman devreye girdi, o tarihten önceki workspace'lerde hâlâ düz metin var mı.

4. **[Yüksek] Woo · Park edilmiş WooCommerce siparişi serbest bırakma, çıplak eski eşleyiciyi kullanıyor — taksit birleştirme ve motor damgası atlanıyor.** `index.js:14345-14351` doğrudan `mapWooCommerceOrderToSiparis` + `integrationOrderUpdate` çağırıyor, `wooConnector.js`'in `applyWooOrder`/`engine.applyEnvelope`'undan GEÇMİYOR. Hemen altındaki Shopify dalı (14352-14367) tam tersini yapıyor ve yorumda bunu açıkça söylüyor (MERGE-006). Sonuç: bir taksit adayı varken serbest bırakılan Woo siparişi birleşmek yerine ikinci sipariş olarak açılıyor, `commerce.provider` alanı hiç yazılmıyor. Test yok.

5. **[Yüksek] Shopify · Resmi uygulama, güncelleme yolunda paylaşılan alan-sahipliği mekanizmasını (`integrationOrderUpdate`/`ownership.js`) hiç kullanmıyor — kargo adresi/müşteri iletişim/kalem değişiklikleri hiç senkron olmuyor.** `index.js:30570-30606`: var olan sipariş sadece `customFields["Shopify Status"]`, `customFields["Shopify Total"]` ve iptalde `status` alanlarını yamalıyor. Bilinçli (yorum: "a full re-map would stomp the merchant's in-app edits") ama sonucu: Shopify'da kargo adresi düzeltilse veya sipariş kalemi değişse, NivaDesk'teki sipariş bunu hiç görmüyor — sadece toplam tutar güncelleniyor, atölyenin okuduğu ürün listesi eskide kalıyor.

6. **[Yüksek] Shopify · Entegrasyonlar panosu kartı, uygulaması kaldırılmış (uninstalled) bir mağaza için "Connected" (yeşil) gösteriyor — hem web hem Android'de bağımsız olarak aynı hata.** `integrations.ts:246-253`: `live = shopifyStores.filter(s => s.status !== "unlinked")`; `"uninstalled"` durumu ne `"unlinked"` ne `"paused"` sayıldığından `live` içinde kalıp "connected" dönüyor. Android'de `IntegrationsHub.kt:108-115` aynı hatayı bağımsız olarak tekrarlıyor. Detay ekranları (web `settings/page.tsx:5605-5631`, Swift `AyarlarView.swift:11080-11086`) dürüst. Bu, dosyanın kendi tasarım hedefiyle ("bağlı diyen bir kart, hiç kart olmamasından kötü") doğrudan çelişiyor.

7. **[Yüksek] Shopify · SHOP-004 Faz B: bayrağı kapatmak tek başına belgelenen davranışı üretmiyor, geri-dönüş scripti yok.** `shopifyStoreAccessToken` kutu çözümü başarısız olduğunda HER ZAMAN düz metne geri dönüyor — Faz B'nin "kutunun çözülmemesi hataya dönüşecek" vaadi için ayrıca kod değişikliği gerekiyor. `SHOPIFY_TOKEN_DUAL_WRITE=false` durumunu test eden hiçbir test yok; kutu bozulursa (anahtar rotasyonu/bozuk kutu) tek çare mağazanın yeniden kurulumu. Kanıt: `index.js:29650-29656` (yorum), `29657` (bayrak). Kontrol edilecek: 16 Eylül'e kadar `shopifyStoreAccessToken`'ın kendisi de değiştirilecek mi.

8. **[Yüksek] Shopify · Onaylanmış bir abonelik "billed_elsewhere" ile hak tanımı reddedilirse, Shopify'daki gerçek abonelik kendiliğinden iptal edilmiyor.** `app.plan.tsx` Shopify'da aboneliği önce yaratıyor; dönüşte `applyShopifySubscription` (`index.js:29544-29613`) workspace o arada başka bir rayla faturalanır hale geldiyse hak tanımını reddediyor ama abonelik canlı kalıyor. Repo genelinde `appSubscriptionCancel`/`cancelSubscription` sıfır sonuç. Tek çare merchantın kendi Shopify panelinden iptali; proaktif tespit/uyarı yok. Test yok.

9. **[Orta] Shopify · `customers/data_request` sadece denetim kaydı yazıyor, otomatik veri ihracı/gönderimi yok.** `index.js:30762-30801`, sadece `privacyRequests` koleksiyonuna satır ekleniyor. `docs/shopify-app/COMPLIANCE.md:31` bunun elle yapıldığını zaten kabul ediyor — sahte 200 değil ama proaktif de değil.

10. **[Yüksek] Shopify · `customers/redact` anonimleştirme mantığının gerçek veriye karşı hiç testi yok.** `test/e2e/shopify-webhook-emulator.test.js` GDPR konularını sadece kayıtlı olmayan bir mağazaya karşı test ediyor (`storeData=null` → `redactShopifyCustomerData` hiç çağrılmıyor). Statik okumada doğru görünüyor ama bir yeniden adlandırma (`customFields.Source`) sessizce kırabilir, CI yakalamaz.

11. **[Orta] Shopify · GDPR redaksiyonu 400 sipariş / 50 müşteri sınırıyla çalışıyor.** `index.js:30710-30736`: sorgular `.limit(400)`/`.limit(50)`. Kontrol edilecek: gerçekçi bir tekrar-müşteri bu sınırı aşabilir mi, aşarsa kısmen redakte edilmemiş kalır.

12. **[Yüksek] Shopify · Salt-okunur scope + kargo/etiket geri-itme özelliği kodda hiç yok, ama `docs/shopify-app/ARCHITECTURE.md` bunu kurulmuş gibi anlatıyor.** `fulfillmentCreateV2`, `tagsAdd`, `write_orders`, `write_fulfillments` — repo genelinde sıfır sonuç. Gerçek UI dürüst: `app/routes/app.settings.tsx:168-170` sadece "coming soon" yazısı, checkbox yok. `shopify.app.toml:12` sadece `read_orders,read_customers,read_products,read_fulfillments`.

13. **[Orta] Shopify · Embedded Remix uygulamasının Admin API sürümü (2026-07) backend'in kullandığından (2026-10) farklı; faturalandırma akışı eski sürümde çalışıyor.** `shopify.server.ts:13` (`ApiVersion.July26`) vs `index.js:30246` (`SHOPIFY_APP_API_VERSION="2026-10"`). İki sürüm arasında senkronu koruyan hiçbir test/pin yok.

14. **[Orta] Shopify · `docs/shopify-app/COMPLIANCE.md` satır referansları ~8300 satır kaymış ve "Billing API v1'de kullanılmıyor" iddiası artık yanlış.** 12 Ağustos'ta doğrulandığı iddia ediliyor ama 28 Ağustos USD faturalandırma geçişinden önce yazılmış.

15. **[Düşük] Shopify · `docs/shopify-app/ARCHITECTURE.md` §10 yanlış para birimi/tutar veriyor (GBP £9/£19/£49) — gerçek kod $12/$25/$65 USD.**

16. **[Orta] Shopify · `app/uninstalled` webhook konusunun oturum-temizleme kod yolu (index.js:30905-30912) gerçek HTTP handler üzerinden hiç test edilmiyor** — sadece bridge eyleminin token-temizleme yan etkisi test ediliyor.

17. **[Düşük] Shopify · Ölü Prisma/SQLite kalıntısı** — `db.server.ts`, `prisma/schema.prisma`, `prisma/dev.sqlite` hiçbir yerden import edilmiyor; oturum deposu `FirestoreSessionStorage`. Temizlik gerekiyor.

18. **[Orta] Shopify · Eski `shopifyWebhookToken` temizleme yolu artık kalıcı olarak erişilemez** — `getShopifyWebhookToken` artık her zaman fırlatıyor (`assertIntegrationKindLive`), bu yüzden eski bir workspace'te kalan düz metin token'ı self-heal edecek hiçbir tetikleyici kalmadı. Pratik risk düşük (uç zaten ölü) ama aynı sınıf sorun.

19. **[Orta] Woo · `WEBHOOK_TOPICS` 5, `docs/DURUM.md:22` ve denetim brifinginin kendisi 10 diyor.** `wooConnector.js:35`: `order.created/updated/deleted, customer.created/updated`. Ayrı bir Woo iade webhook konusu YOK — refund tespiti `order.updated` + durum değişikliğine mi, yoksa 15 dk'lık mutabakata mı dayanıyor? Kontrol edilecek: bir Woo iadesi ne kadar gecikmeyle NivaDesk'e yansıyor.

20. **[Yüksek] Woo · REST API hatası zamanlı mutabakatta tamamen sessiz, manuel yollarda jenerik hataya dönüşüyor.** `wooConnector.js:394`'teki `client.listOrders()` try/catch'siz; sadece dışarıdaki `reconcileWooConnections` sweep'i `console.warn`'la yutuyor — bağlantı belgesi, dolayısıyla Ayarlar ekranındaki "son senkron" rozeti güncellenmiyor. `syncWooNow`/`previewWooImport`/`runWooImport`/`auditWooOrders` aynı şekilde korumasız; hata Firebase'in jenerik mesajına dönüşüyor, `finishWooConnect`'in bağlanma-anındaki spesifik "REST API'yi kontrol et" mesajı kayboluyor. Bu, "eklenti çakışması kullanıcıya nasıl görünür" sorusunun tam cevabı: bağlanırken net, sonrasında sessiz/jenerik.

21. **[Yüksek] Woo · Referans mimari dokümanı ("Woo'da hiç API istemcisi yok... kalıcı kayıp") artık kökten yanlış.** `NivaDesk_shopify_woocommerce.md` satır 26-28 ve 267-270, `wooConnector.js`'den (git: 02:35) 3 saat 19 dakika ÖNCE yazılmış (git: 00:16). Bugün tam bir REST istemcisi, 15 dk mutabakat, backfill VE özel bir eksik-sipariş denetleyicisi (`auditWooOrders`) var — dokümanın "sadece Etsy'de var" dediği tam da bu. Bir "müşterinin siparişi kayıp" olayında bu dokümana bakan mühendis yanlış yönlendirilir.

22. **[Yüksek] Woo · "Planned/Coming soon" çelişkisi gerçekti ama tek gecede (~9 dakika) kapandı — kullanıcının hafıza notu artık güncel değil.** Git: `integrations.ts`'te Woo `"webhook"→"planned"` (e290dae) → `"native"` (eec1b25, 2026-09-02 03:41:44) 9 dakika sonra Mac/iPhone/Android aynı gece (ae80926, 03:50:58). Bugün üçünde de doğrudan okumayla `kind:"native"` doğrulandı (`integrations.ts:64-68`, `NivaDeskIntegrations.swift:85`, `IntegrationsHub.kt:152`). Not: "WooCommerce is coming back as a full connector" mesajı (`index.js:18603`) artık sadece iki ulaşılamaz callable'da (`getWooCommerceWebhookToken`, `saveWooSignatureSecret`) kalan bayat bir metin, aktif bir kesinti göstergesi değil.

23. **[Düşük] Woo · `fee_lines`/`coupon_lines`/`prices_include_tax` Woo eşleyicisinde hiç okunmuyor.** Toplam tutar Woo'nun kendi `order.total`/`total_tax` alanlarından geldiği için DOĞRU kalıyor, ama bir "acele ücreti" fee-line olarak eklendiyse kalem dökümünde/faturada görünmüyor.

24. **[Düşük] Woo · Guard clause'ta ölü durum dizesi** (`"partially_refunded"` Woo adaptöründen asla çıkmıyor) — kopyala-yapıştır kalıntısı, zararsız.

25. **[Pozitif, not] Woo · Kimlik bilgisi şifrelemesi SHOP-004'ten daha eski ve daha sıkı** — `consumerKeyEncrypted`/`consumerSecretEncrypted`/`webhookSecretEncrypted` ilk commit'ten beri AES-256-GCM; hiç düz metin alanı olmadı.

26. **[Pozitif] Woo · wc-auth anahtar değişimi sağlam** — 192-bit state, transaction içinde tek kullanımlık tüketim, anahtarlar `client.probe()` ile doğrulanmadan güvenilmiyor.

27. **[Pozitif] Woo · Webhook kimlik doğrulama token+HMAC ikisini de zorunlu kılıyor, imza başlığı yoksa reddediyor (sessizce kabul etmiyor).** `signature.js:11`: başlık yoksa direkt `false` → 401. Eski `wooWebhookAuthDecision`'dan (imza yoksa token'a düşen) daha katı.

28. **[Düşük] Woo · Self-signed/geçersiz TLS sertifikası için bypass yok (güvenli) ama ayrı hata mesajı da yok** — DNS hatasıyla aynı jenerik mesaj.

29. **[Orta, dikkat] Woo · Ayrı bir uncommitted worktree, artık ölü callable'ları (`saveWooSignatureSecret`, `rotateIntegrationWebhookToken("woocommerce",...)`) çağıran UI kodu içeriyor.** `studioflow-web/.claude/worktrees/affectionate-edison-7af5f2/` — bu dal `RETIRED_INTEGRATION_KINDS`'i güncellemeden birleşirse her eylem "retired" hatası fırlatır. Ana ağacın dışında ama gözden kaçmaması gereken bir risk.

30. **[Kritik] Inbound · Sırasız teslimat (ödendi→iade→ödendi) koruması yok — motor bu yola hiç bağlı değil.** `inboundOrderWebhook` (`index.js:19903+`) `commerce.engine.applyEnvelope`'u hiç çağırmıyor; doğrudan `mapGenericInboundOrderToSiparis`→`integrationOrderUpdate`→`ref.set`. Motorun `SYNC-013` ("stale" reddi, `engine.js:64`) ve `SYNC-014` (duplicate) korumaları bu kanalda YOK. Aynı senaryo motor tarafında test edilip kanıtlanmışken (`commerce-engine-emulator.test.js:101-105`), inbound için ne kod ne test var.

31. **[Yüksek] Inbound · Token kontrolüne rate limit/App Check yok; token kontrolünden önce 2 Firestore okuması zorlanabiliyor.** `index.js:19937` (şirket var mı) → `19942` (`readIntegrationSecret`, kendi içinde 1-2 okuma daha) → `19943` karşılaştırma. `companyId` gizli sayılmadığından, gerçek bir `companyId` bilen biri 401'den önce sınırsız okuma tetikleyebilir.

32. **[Düşük] Inbound · 404 (bilinmeyen şirket) ile 401 (yanlış token) ayrımı, kimlik doğrulanmamış çağırana şirket varlığını sızdırıyor.**

33. **[Yüksek, düzeltme] Inbound/Engine · WooCommerce'in yeni bağlayıcısı motoru GERÇEKTEN kullanıyor — bir alt-ajan "hiç kullanmıyor" sonucuna varmıştı, `wooConnector.js` dosyasını hiç okumadığı için.** Doğrudan doğrulama: `wooConnector.js:284-291`, `engine.applyEnvelope(db(), envelope, {..., mode:"apply", capacity:..., hold:...})`. Sonuç: üç kanal motorun üç farklı aşamasında — Woo canlıda motoru kullanıyor (sıra-dışı/tekrar koruması dahil ücretsiz alıyor), Shopify sadece gölgede karşılaştırıyor, Inbound hiç dokunmuyor. Bu, raporun en önemli mimari bulgusu.

34. **[Yüksek] Inbound · `CommerceSyncHealthCard` hiçbir yerde `provider="inbound"` ile başlatılmıyor — bu kanalın senkron sağlığı hiçbir arayüzde görünmüyor.** Kart tam olarak 4 yerde kullanılıyor: etsy/woocommerce/square/shopify (`EtsyIntegrationSection.tsx:379`, `WooCommerceIntegrationSection.tsx:154`, `SquareIntegrationSection.tsx:156`, `settings/page.tsx:5709`) — inbound hiçbirinde yok. `inboundOrderWebhook` zaten `commerce.health.touchHealth`'i hiç çağırmıyor, `commerceEvents`'e hiç yazmıyor. Tek görünürlük 9 kayıtlık `recentDeliveries` — o da ayrıştırılamayan-toplam durumunu göstermiyor (bkz. #35).

35. **[Orta] Inbound · Gerçek teslimatta ayrıştırılamayan toplam sessizce `paidAmount:0` yazıyor, hiçbir uyarı üretmiyor.** `inboundPayloadWarnings` sadece test-teslimatı ve `validateInboundOrderPayload` dallarında çağrılıyor — gerçek sipariş dalında hiç. £0'lık bir sipariş normal 200 dönüyor, hiçbir yerde loglanmıyor.

36. **[Yüksek] Inbound · Kaynak-etiketi sahtekarlığı DÜZELTİLMİŞ (artık güncel değil bir endişe) — ama bu, referans dokümanının 6. yanlış iddiasıydı.** `index.js:19753-19756` (`INBOUND_SOURCE_LABELS` allowlist, INB-002/003) ve `20041-20047` (müşteri kaydında `sourceTag` artık her zaman sabit `"inbound"`) — "bir gönderen 'shopify' yazıp gerçek Shopify müşteri havuzuna karışabiliyordu" sorunu zaten kapatılmış. Kod yorumu bunu geçmiş zamanla açıkça anlatıyor.

37. **[Bilgi/Pozitif] Inbound · Kapasite/park mekanizması DÜZELTİLMİŞ (INB-006) — referans doküman hâlâ "hiç kontrol etmiyor" diyor, bu yanlış.** `index.js:20012-20026`, yorum: "This one never checked, so a free workspace could take unlimited orders from Zapier" (geçmiş zaman). `test/e2e/inbound-capacity-emulator.test.js:140-149` ile kanıtlı.

38. **[Bilgi/Pozitif] Ölü mektup (dead-letter) sınırı gerçek ve test edilmiş — Banking'teki sonsuz-özyineleme sınıfı risk burada tekrarlanmıyor.** `events.js:12` (`MAX_ATTEMPTS`, hata sınıfına göre 1-6 deneme) → sınır aşılınca `retryDelayMs` `null` döner → durum `"dead"`, yeniden kuyruklanmıyor. 6. deneme dahil test edilmiş (`commerce-engine-emulator.test.js:152-170`). Zayıf nokta: manuel `retryCommerceEvent` (`index.js:31549-31563`) yeniden "retrying" durumuna düşerse otomatik tekrar kuyruklamıyor — owner Retry'a basıp göstergesiz tekrar etmesi gerekebilir.

39. **[Orta] Motor · `cursors.js` şu an sadece yazılıyor, hiçbir canlı yeniden-bağlanma penceresini yönetmiyor.** `index.js` genelinde tek çağrı (`recordPass`, satır 31450); `readCursor`/`cursorWindow` hiç çağrılmıyor. Gerçek Shopify mutabakatı ayrı eski `store.reconcile.windowToMs` mekanizmasını kullanıyor; modülün kendi yorumu bunu kabul ediyor ("Faz 3'e kadar yanında yazılıyor").

40. **[Yüksek] Motor · Müşteri çakışma politikası varsayılan olarak "mağaza kazanır" — personelin elle düzelttiği telefon/isim bir sonraki siparişte sessizce eziliyor.** `upsertIntegrationCustomer` (`index.js:18538`): `storeWins = !(integrationCustomerSync === "nivadesk")`. Owner bu ayarı bulup açıkça değiştirmedikçe, aynı kanaldan gelen bir sonraki sipariş personelin düzelttiği bilgiyi eziyor. Alan-bazlı değil, tek workspace-geneli anahtar. `upsertIntegrationCustomer`'ın çakışma politikası için hiç test yok.

41. **[Orta] Motor · Kanallar arası mükerrer müşteri sadece tam e-posta/tam isim eşleşmesiyle birleşiyor.** Aynı kişi farklı e-posta veya farklı yazılmış isimle iki kanaldan sipariş verirse sessizce ikinci bir müşteri kaydı doğuyor; keşfi ancak personelin elle `mergeWebCustomers` çalıştırmasıyla mümkün.

42. **[Yüksek] Motor · `resyncIntegrationCustomer`, workspace'in "NivaDesk kazanır" ayarını tamamen yok sayıp 13 alanı koşulsuz eziyor.** `index.js:14150-14163`: `email/phone/address/streetAddress/city/postalCode/country/shippingAddress/...` — `companySettings.integrationCustomerSync` bu fonksiyonda hiç okunmuyor/referans edilmiyor. Personel tetiklemeli bir eylem olduğu için tamamen "bug" sayılmaz, ama owner özellikle "mağaza asla ezmesin" ayarını açtıysa, uygulamadaki HİÇBİR "resync" düğmesinin bunu aşabileceğini beklemez.

43. **[Bilgi/Pozitif] Motor · Aynı sipariş kimliğinin iki workspace'e bağlanması, motor seviyesinde transactional olarak reddediliyor (DATA-002) — ama bu koruma sadece sipariş bazında, bağlantı kurma anında değil.** `engine.js:52-55`: `identityData.companyId !== ctx.companyId` → `{result:"invalid", problems:["identity_bound_to_other_workspace"]}`. Bu SİPARİŞ yazımını korur; iki workspace'in aynı mağazaya BAĞLANMASINI engelleyen ayrı bir kontrol bulunamadı.

44. **[Yüksek] · İki workspace'in aynı mağazayı iddia etmesi gerçek bir olay olarak yaşandı ve elle düzeltildi — bağlantı-anı koruması doğrulanamadı.** `docs/DURUM.md:19-20`: "EGGcraft mağazası EGGcraft workspace'ine bağlı; test7'deki kopya bağlantı kesildi" (2 Eylül). Sipariş-seviyesi koruma (#43) var ama bu olayın kendisinin nasıl önlendiği/önlenemediği doğrulanamadı. Kontrol edilecek: `beginWooConnect`/`shopifyCompleteConnect`'te aynı mağaza için ikinci bir workspace'in bağlanmasını engelleyen açık bir kontrol var mı.

45. **[Orta] Motor · Gölge modu (shadow) sadece "canlı kodla aynı mı" diye bakıyor, doğruluğu kontrol etmiyor.** `shadow.js`'in `diffPatchAgainstDoc`'u sadece motor çıktısı ile canlı belge arasındaki FARKI kaydediyor; ikisi de aynı (yanlış) davranışı sergiliyorsa `agree:true` yazıp hiçbir şey işaretlemiyor. #2'deki refund/paidAmount hatası tam bu senaryo — eski Shopify yolu da aynı hatayı taşıdığı için gölge karşılaştırması bunu hiç yakalamıyor olabilir.

46. **[Orta] Motor · `heldIntegrationOrders` hiç TTL'siz ve redakte edilmemiş ham kişisel veriyle sonsuza dek duruyor.** `holdIntegrationOrder` (`index.js:2722-2745`) ham `payload`'ı (isim/e-posta/telefon/adres dahil) hiç maskelemeden yazıyor, `expireAt` yok — Shopify'ın kendi `syncLog` hata satırlarına uyguladığı PII-temizleme+32KB sınırı (RET-002/OBS-002) ve 14 günlük `expireAt`'in tam tersi. Client'a kapalı (firestore.rules'ta wildcard'dan hariç tutulmuş, deny-all'a düşüyor) ama saklama hijyeni açısından zayıf. `NivaDesk_shopify_woocommerce.md:313-316` bunu bağımsız olarak doğruluyor.

47. **[Orta] Motor · `webhookEvents`/`syncLog`/`commerceEvents`/`commerceShadow`'a `expireAt` damgalanıyor ama repoda hiçbir Firestore TTL politikası kurulmamış — hiçbiri gerçekte silinmiyor.** Repo genelinde `ttl-polic`/`TtlPolicy` için sıfır sonuç (ne gcloud komutu ne script). Kod, kendini temizleyen bir sistem izlenimi veriyor ama alan adı olmanın ötesinde bir GCP-seviyesi TTL kaynağı hiç oluşturulmamış görünüyor — bu, canlı GCP konsolundan doğrulanmalı (statik koddan kesin ispatlanamaz).

48. **[Orta] Motor · Paylaşılan alan-sahipliği (`integrationOrderFields.js` + `ownership.js`) iyi birleştirilmiş (kopya değil import) — TEK istisna resmi Shopify uygulamasının bespoke dar yaması.** `ownership.js:1-10` kendi yorumunda önceki bir kopya-drift bug'ından açıkça bahsedip bunu tekrarlamamak için `integrationOrderFields`'i import ediyor — iyi mühendislik disiplini. Ama Shopify'ın canlı yolu (`applyShopifyOrderEventLive`) ne bunu ne motoru kullanıyor; kendi 3-alanlık yamasını elle sürdürüyor (bkz. #5). Bu, "hangi alan kime ait" tanımının üçüncü, senkronsuz bir kopyası.

49. **[Bilgi/Pozitif] Bayraklar (`shadow`/`queue`) üç ayrı seviyede varsayılan kapalı ve okuma hatasında güvenli tarafa düşüyor.** `flags.js:13` (EMPTY=kapalı), okuma başarısız olursa `console.warn` + "everything stays off". `docs/DURUM.md:17-19`'un "Cloud Tasks işçisi bayrakla kapalı" iddiasını doğruluyor.

50. **[Orta] Test · `integration-secrets.mjs` artık ölü bir uca (`shopifyOrderWebhook`) test yazıyor ve dosyada "inbound" kelimesi hiç geçmiyor.** 25 Ağustos tarihli, 2 Eylül retirement'ından önce; `getShopifyWebhookToken`'ı çağırıyor (artık her zaman fırlatıyor) — kendi `call()` yardımcısı `json.error`'da fırlattığından dosya muhtemelen erken kesiliyor. `test:ci`'ye değil sadece manuel `test:integration`'a bağlı. Sonuç: token döndürmenin (rotation) canlı "inbound" kanalı için geçen, güncel bir testi yok — davranış kodda garanti (`index.js:18864-18886`, tek alan üzerine yazma, geçiş dönemi yok) ama hiçbir test bunu bugün doğrulamıyor.

51. **[Yüksek] Test · Resmi Shopify uygulamasının GDPR redaksiyon mantığı (#10) ve `upsertIntegrationCustomer`'ın çakışma politikası (#40) sıfır test kapsamına sahip** — ikisi de finansal olmayan ama itibar/uyum açısından kritik yollar.

52. **[Orta] Genel · Referans mimari dokümanı (`NivaDesk_shopify_woocommerce.md`, 1 Eylül) en az 6 spesifik noktada güncel kodla çelişiyor, hepsi "zaten düzeltilmiş" yönünde** (manuel katman canlı sanılıyor → emekli; inbound kapasite kontrolsüz sanılıyor → INB-006 ile düzeltildi; kaynak-sahtekarlığı mümkün sanılıyor → düzeltildi; resmi Shopify kapasite atlıyor sanılıyor → düzeltildi; held-order else dalı siliyor sanılıyor → TEST-016 ile düzeltildi; rehber (guide.ts) Shopify bölümü yok sanılıyor → kapsamlı EN+TR içerik var). Öneri: bu doküman iki günde ~yarısı bayatlamış — kısa bir tazeleme geçişi hak ediyor, aksi halde bir sonraki mühendis yanlış zemin üzerine karar verir.

53. **Native parite (Q12) özet tablosu:**

| Eylem | Web | Mac/iPhone | Android |
|---|---|---|---|
| Resmi Shopify OAuth bağlantısını tamamlama | ✅ | ❌ | ❌ |
| Shopify token döndürme / test teslimatı / teslimat geçmişi | ✅ | ❌ | ❌ |
| Woo imza secret'ı ayarlama | ✅ | ❌ | ❌ |
| Woo connect/sync/import/audit/disconnect | ✅ | ✅ | ✅ |
| Sync health kartı (Woo/Etsy/Square/Shopify) | ✅ | ✅ | ✅ |
| Sipariş detayında Shopify kaynak şeridi | ✅ | ✅ | ✅ |
| Sipariş detayında Woo/inbound kaynak şeridi | ✅ | ✅ | ✅ |
| Park edilmiş sipariş serbest bırakma | ✅ | ❌ (sadece sayı gösterir) | ❌ (sadece sayı gösterir) |

Web-only satırların çoğu **sunucu eksiği değil** — native'ler zaten aynı callable'ı çağırıp yanıttan sadece üç boolean/sayı okuyor, geri kalan alanlar (recentDeliveries, lastDeliveryError, tokenCreatedAtMs) zaten geliyor ama UI'da işlenmiyor.

54. **Test kapsamı (Q13) genel özet:** Güçlü kapsanan: Shopify HMAC/idempotency/upgrade-race/cross-rail billing guard, Woo wc-auth güvenliği/webhook dedup/instalment-merge/URL normalizasyonu, motor stale/duplicate/dead-letter/shadow-yazmama garantisi. Sıfır veya zayıf kapsanan (tekrar): resmi Shopify'ın gerçek redaksiyon etkisi, inbound sıra-dışı teslimat, `upsertIntegrationCustomer` çakışma politikası, `identity_bound_to_other_workspace` senaryosu, iki-workspace-aynı-mağaza bağlantı-anı koruması, `heldIntegrationOrders` TTL'siz saklama, Woo REST hata yolu (plugin çakışması), DNS-rebinding.

---

**Dosya yolları (en çok atıfta bulunulanlar):** `/Users/gocmen/Developer/studioflow-app/functions/index.js`, `/Users/gocmen/Developer/studioflow-app/functions/wooConnector.js`, `/Users/gocmen/Developer/studioflow-app/functions/commerce/{engine,envelope,envelopeToOrder,events,worker,ownership,money,flags,shadow,cursors,health,capabilities}.js`, `/Users/gocmen/Developer/studioflow-app/functions/commerce/woo/{client,url,signature}.js`, `/Users/gocmen/Developer/studioflow-app/functions/integrationOrderFields.js`, `/Users/gocmen/Developer/studioflow-app/firestore.rules`, `/Users/gocmen/Developer/studioflow-app/NivaDesk_shopify_woocommerce.md`, `/Users/gocmen/Developer/studioflow-app/docs/DURUM.md`, `/Users/gocmen/Developer/studioflow-app/docs/shopify-app/{ARCHITECTURE,COMPLIANCE,TESTS,LISTING}.md`, `/Users/gocmen/Developer/studioflow-app/nivadesk-order-management/` (tüm Remix app), `/Users/gocmen/Developer/studioflow-app/studioflow-web/lib/studioflow/{integrations.ts,woocommerce.ts}`, `/Users/gocmen/Developer/studioflow-app/studioflow-web/app/settings/{WooCommerceIntegrationSection,CommerceSyncHealthCard,page}.tsx`, `/Users/gocmen/Developer/studioflow-app/studioflow-web/lib/publicSite/guide.ts`.

---

# 5) BANKA (Open Banking) · PAYPAL · SQUARE


Denetlenen: TrueLayer banka akışı (`functions/bankFeed.js`, 1962 satır — tam okundu), PayPal akışı (`functions/commerce/paypal/{client,normalize}.js`), Square bağlayıcısı (`functions/squareConnector.js`, 948 satır + `functions/commerce/square/*` + `functions/commerce/adapters/square.js`), ortak yerleştirme motoru (`functions/commerce/{settlements,settlementMatch}.js` — tam okundu), `firestore.rules` + `storage.rules` (tam okundu), `functions/index.js` bağlama noktaları + plan hakları + ChatGPT/MCP banka araçları, web (`bank/page.tsx` 3873 satır, `PayPalIntegrationSection.tsx`, `SquareIntegrationSection.tsx`), native (EGGcraft Swift, Android Kotlin), dokümanlar ve 10 test dosyası. Üç paralel alt-inceleme (Square, PayPal, Banka web/native/doküman/test) artı kendi doğrudan kod okumam (bankFeed.js'in tamamı, kurallar, yerleştirme motoru, index.js kablolaması ve MCP asistan araçları) çapraz doğrulandı.

---

### A) Akış Haritası

1. **Bağlan (Banka/TrueLayer):** Owner `bankCreateRequisition` çağırır (`bankFeed.js:371-397`) → TrueLayer'a `scope=info accounts balance transactions offline_access` ile yönlenir (ödeme başlatma izni YOK) → dönüşte `bankFinalizeRequisition` (`:399-498`) token'ı `bankTokens/{id}`'ye **şifresiz** yazar, ilk 2 yıllık geçmişi dener (403'te 90 güne düşer), `consentExpiresAt = şimdi+90 gün` damgalar.
2. **Bağlan (PayPal):** Owner kendi PayPal REST uygulamasının client id/secret'ını yapıştırır (OAuth DEĞİL) → `paypalConnect` (`:1742-1783`) client_credentials ile doğrular, secret'ı AES ile şifreleyip yazar, ilk 180 günü çeker.
3. **Bağlan (Square):** Gerçek OAuth, salt-okunur kapsamlar (`MERCHANT_PROFILE_READ, ORDERS_READ, PAYMENTS_READ,...`, `commerce/square/oauth.js:12-14`) → token'lar workspace-dışı `squareConnections`'a şifreli yazılır.
4. **Zamanlanmış senkron:** `scheduledBankSync` her 8 saatte (`:721-737`, ilk 300 workspace, sayfalama yok) TrueLayer(90g)+PayPal(14g) çeker; Square kendi 15 dk webhook+reconcile döngüsü + Events API (28g kurtarma) kullanır.
5. **Idempotency:** Her kaynak deterministik doc-id'ye yazar (`accountId_txId`, `square_{cid}_{orderId}`, `pp_...`) — tekrar senkron üzerine yazar, çoğaltmaz.
6. **Beklemede→kesinleşti:** TrueLayer pending işlem booked olunca `normalisedProviderId` ile eski pending silinir, zenginleştirme taşınır (`:339-367`).
7. **Yerleştirme (settlement matching):** Her senkrondan sonra `settlements.matchAll()` Square+PayPal payout'larını banka satırlarıyla otomatik eşler (skor≥85, ikinciyle fark≥15, ±3 gün, tutar+para birimi tam) → eşleşen satır `incomingKind:"payout"` damgalanır, ciro toplamlarından **web panelinde** çıkarılır (`bank/page.tsx:1519`).
8. **Sınıflandırma/inceleme:** Sadece **owner** (her callable `requireOwner`) kategori/kural/VAT/split/fiş işler; izinli üye sadece **okuyabilir**.
9. **Sipariş bağlantısı — 3 ayrı, karışmayan callable:** `bankLinkTransactionToOrder` (gider), `bankMatchIncomingToOrder` (gelen ödeme), `bankLinkRefundToOrder` (iade/chargeback) — UI'da aynı anda tek bölüm gösterilir, karıştırma riski yok.
10. **Durum nerede yaşıyor:** `bankConnections/bankTokens/bankTransactions/bankCategories/bankRules/bankVendors/bankAuditLog/bankReceiptInbox/paypalPayouts/squarePayouts` — hepsi `companies/{id}` altında, joker deny-list'ten hariç tutulup kendi `canReadBankFeed()` kuralına bağlı.
11. **Üçüncü erişim yolu:** ChatGPT/MCP asistanı (`index.js`) aynı `bankTransactions`'ı **bağımsız üçüncü bir yetki fonksiyonuyla** (`nvRequireBankFeedAccess`) okur; toplamları web'den **farklı** hesaplar.
12. **Bozulma sınıflandırması:** `classifySyncError` rate_limited/needs_reconsent/data_denied/error ayırır; needs_reconsent tek hatada, diğerleri 2 ardışık hatada devreye girer; owner'a **sadece durum değiştiğinde bir kez** bildirim gider.
13. **Bağlantıyı kes vs sil:** disconnect sadece token siler (veri kalır); purge token+o bağlantının tüm işlemlerini (+PayPal payout'larını) siler ama Storage'daki fiş dosyalarına dokunmaz; TrueLayer/PayPal tarafında bir "revoke" API çağrısı **yok** (Square'de var).
14. **Plan kapısı:** `bank_feed=Pro+` sadece web istemcisinde kontrol edilir; sunucuda (`functions/*.js`) hiçbir yerde bu anahtar yok.
15. **Native:** Bağlan hem Banka hem Square/PayPal'de **web-only**; kategori yönetimi bilinçli web-only; toplu inceleme her iki native platformda **ölü kod** (tanımlı, çağrılmıyor); Android banka bağlantısını kesemez/silemez (iOS yapabiliyor).

---

### B) Bulgular

### Çapraz-kesen / Ortak

1. **[Yüksek] Ortak · `bank_feed` plan kapısı sadece istemcide var** · Free/Demo planındaki bir owner, callable'ları doğrudan çağırarak (tarayıcı konsolu/script) Pro'ya özel banka akışını bedava aktive edebilir. · Kanıt: `functions/*.js` içinde `"bank_feed"` sıfır eşleşme; `functions/index.js` `PLAN_ENTITLEMENTS` (~1966) nesnesinde `bank_feed` anahtarı yok; `createBankFeedFunctions` kablolaması (`index.js:5707-5726`) hiçbir hak-kontrol callback'i almıyor; `requireWorkspaceForBilling` (`index.js:2643-2674`) sadece üyelik/owner kontrolü yapıyor, plan özelliği hiç bakmıyor. İstemci kapısı: `studioflow-web/app/bank/page.tsx:574`, `lib/studioflow/plans.ts:20,66,94,122,154`. · Kontrol: Square/Woo/Etsy connect'leri de aynı `requireWorkspaceForBilling`'i kullanıyor — aynı boşluk onlarda da var mı?

2. **[Orta] Ortak · "Kim banka verisine erişebilir" üç ayrı yerde elle yeniden yazılmış** · `bankFeed.js`'nin `requireOwner` (satır 129-141, sadece gerçek owner, admin istisnası yok), `firestore.rules`'un `canReadBankFeed` (92-96, owner VEYA `memberAccess.bankFeed=true` üye), `index.js`'nin `nvRequireBankFeedAccess` (22936-22945, farklı bir `uidCanAccessWorkspaceArea` fonksiyonuna dayanıyor) — üçü bugün tutarlı (varsayılan false doğrulandı, `index.js:~2489`) ama `firestore.rules:648-651`'deki kod yorumu geçmişte `bankAuditLog`'un tam bu joker listeden **unutulduğunu ve herhangi bir üyenin denetim kaydını yeniden yazabildiğini** itiraf ediyor — desen kırılgan, tekrar kayabilir.

3. **[Yüksek] Ortak · ChatGPT/MCP asistanının banka özeti web panelinden farklı (yanlış) rakam veriyor** · Sahibi asistana "bu ay ne kadar geldi/gitti" diye sorduğunda, Square/PayPal ödeme aktarımları, owner transferleri ve iade/chargeback'ler dahil edilmiş şişirilmiş bir rakam alır. · Kanıt: `index.js:22948-22961` (`nvLoadBankTransactions`) ham `amount` işaretine bakıyor, `incomingKind`/`outgoingKind` hiç filtrelemiyor; `nvChatGPTGetBankSpendingSummary` (~22977-23004) `incoming`/`spent`'i böyle topluyor. **Doğru mantık aynı kod tabanında zaten var** ve kullanılmıyor: `studioflow-web/app/bank/page.tsx:43` (`isSpend` → `outgoingKind` hariç tutar) ve `:1519` (→ `transfer/owner_contribution/loan/payout` hariç tutar). Yazma tarafı (`attach_bank_receipt`) doğru şekilde owner-only (`index.js:23157`).

4. **[Yüksek] Ortak · Banka refresh token'ı şifresiz saklanıyor, Etsy/PayPal token'ları şifreli** · Firestore admin erişimi bir şekilde sızarsa (yedek sızıntısı, servis hesabı ele geçirilmesi) canlı banka refresh token'ı düz metin okunur. · Kanıt: `functions/bankFeed.js:430-433` (`refreshToken: cleanText(token.refresh_token,...)` — şifreleme çağrısı yok) vs `functions/etsy.js:102-106` (aes-256-gcm) vs aynı dosyada PayPal secret'ı **şifreli** (`bankFeed.js:1762`, `PAYPAL_TOKEN_KEY`). Bugün `firestore.rules:575-577` `bankTokens`'ı `allow read,write: if false` yapıyor, yani istemci tarafı bir delik değil — savunma-derinliği eksikliği. (Agent bulgusu, satır numaraları doğrulandı.)

### Banka (TrueLayer)

5. **[Düşük/Onay] Banka · "Asla para hareket ettiremez" iddiası doğrulandı** · 4 yüzeyde birebir aynı metin: `bank/page.tsx:1640` + yorum satır 5, `EGGcraft/BankSpendingView.swift:767`, `BankSpendingScreen.kt:499`; sayfa başlığında **bağlan düğmesinden önce** görünüyor (`isOwner && linkedBanks.length===0` şartı aynı blokta, `:1669`). Sunucu tarafı da tutarlı: `bankCreateRequisition`'da istenen scope = `info accounts balance transactions offline_access` (`bankFeed.js:381`), ödeme scope'u yok.

6. **[Orta] Banka · Modül yorumu "UK + EU" diyor ama sadece UK sağlayıcı grubu isteniyor** · `bankFeed.js:3` "TrueLayer (Open Banking AIS, UK + EU)" yazıyor, ama `providers` parametresi `"uk-ob-all uk-oauth-all"` (`:384`) — pratikte banka seçicide muhtemelen sadece UK bankaları listeleniyor. · Kontrol: TrueLayer'ın sağlayıcı-grup adlandırmasını doğrula.

7. **[Yüksek] Banka · İlk derin geçmiş içe aktarma sessizce başarısız olabilir, hiç yeniden denenmiyor** · TrueLayer hesabı ilk bağlanışta 2 yıllık geçmişi çekemezse (`bankFinalizeRequisition`, `:437-443`, try/catch sadece `console.warn`), sonraki HİÇBİR senkron (zamanlanmış veya elle "force") bunu tekrar denemez — `:649-663` her zaman `fullHistory:false` sabit; force sadece 6 saatlik bekleme kapısını atlıyor (`:635`). PayPal'de bunun tam tersi bir borç-takip mekanizması var (`historyImportedAt`, `:634,646-647`) — TrueLayer'da yok. Tek çözüm: bağlantıyı tamamen kesip yeniden kurmak.

8. **[Orta] Banka · Bekleyen fiş OCR eşleşmesi para birimini hiç kontrol etmiyor, onay istemiyor** · Örneğin 40 €'luk bir fatura, tutarı aynı olan 40 £'lık işleme sessizce otomatik iliştirilebilir. · Kanıt: `scoreReceiptCandidates` (`bankFeed.js:1533-1571`) sadece tutar/tarih/kelime skoru veriyor, `tx.currency` hiç karşılaştırılmıyor (OCR çıktısında para birimi alanı da yok); `matchWaitingReceipts` (`:1635-1649`) `confident` olduğunda owner onayı beklemeden direkt iliştiriyor, sadece sonradan bildirim gönderiyor. Eşik: `WAITING_MATCH_MIN_SCORE=75` (`:1612`), tek aday varsa `lead≥20` şartı otomatik sağlanıyor.

9. **[Yüksek] Banka · Kripto olarak doğru ama tetikleme tek seferlik: bozuk akış sessizce sonsuza dek bozuk kalabilir** · `recordSyncFailure` (`:536-573`) bildirimi sadece `data.syncState !== nextState` olduğunda (durum DEĞİŞTİĞİNDE) gönderiyor (`:560`). Bağlantı haftalarca aynı bozuk durumda kalırsa (her 8 saatte bir aynı sonuç), tekrar hatırlatma **hiç** gelmiyor — owner tek bildirimi kaçırırsa akış sessizce güncellenmeyi bırakır, fark etmenin tek yolu Banka sayfasını elle açmak. · Kanıt: `notifyCompany` bu dosyada sadece 2 yerden çağrılıyor (satır 560-572 ve fiş-eşleşme 1655-1667), periyodik hatırlatma yok.

10. **[Düşük/Onay] Banka · "Sabah kopması" hatası doğrulandı: DÜZELTİLMİŞ** · `bankFeed.js:259-283` yorumu HSBC'nin 2 yıllık geçmiş isteğini 403 ile reddetmesi olayını ve düzeltmeyi (2 yıl dene → 401/403'te 90 güne düş) birebir anlatıyor — kullanıcının kendi hafıza notuyla (28 Ağustos düzeltmesi) örtüşüyor, kodda kanıtlı.

11. **[Düşük/Onay] Banka · "Connected" rozeti canlı türetiliyor, statik değil** · `bank/page.tsx:1813` etiketi sadece `status==="linked" AND syncState==="ok"` iken "Connected" gösteriyor — kullanıcının hafıza notundaki 28 Ağustos düzeltmesi kodda doğrulandı.

12. **[Orta] Banka · 90 gün dolmadan önce ÖNCELİKLİ bir uyarı yok, sadece pasif bir tarih rengi** · Owner süresi dolmak üzere olan onayı ancak sayfayı kendisi açıp küçük turuncu bir tarihe bakarak öğreniyor; tek aktif bildirim (push/uygulama-içi) reaktif — senkron zaten başarısız olduktan SONRA tetikleniyor. · Kanıt: `bank/page.tsx:1814-1816` (`consentDaysLeft<=14` sadece rengi değiştiriyor); dosyadaki tek `onSchedule` olan `scheduledBankSync` proaktif bir `consentExpiresAt` taraması yapmıyor.

13. **[Orta] Banka · "Dikkat gerekiyor" toplamı aynı işlemi birden çok kovada sayıyor** · "13 öğe" yazan kutu, aslında düzeltilecek benzersiz işlem sayısını abartabilir (kategorisiz + fişsiz aynı işlem iki kovada birden sayılıyor). · Kanıt: `bank/page.tsx:1146-1163` — `uncategorised.length + noReceipt.length + duplicateIds.size + ...` toplamı, işlem id'sine göre tekilleştirme yapmıyor. (26 Ağustos tarihli iç dokümanda aynı sorun zaten not edilmiş, hâlâ geçerli.)

14. **[Orta] Banka · Bekleyen (henüz kesinleşmemiş) kart işlemleri toplamlara dahil, ayrıştırılmıyor** · "Toplam harcama" ve kategori kırılımı `status` alanına bakmadan her satırı topluyor; pending sadece tarihin yanında küçük bir "· pending" etiketiyle belli oluyor — owner'ın kesin sandığı bir rakam banka kesinleştirdiğinde değişebilir. · Kanıt: `bank/page.tsx:1039` civarı (`monthTotal`, `yearSeries`, `rangeTotal`) hiçbiri `status` filtrelemiyor.

15. **[Orta] Banka · Çoklu para birimi olan workspace'te toplamlar sessizce TEK para birimine indirgeniyor** · KPI kutuları sadece en sık görülen para biriminde hesaplanıyor, geri kalanı sadece bir dipnotla "bu toplamlara dahil değil" diye belirtiliyor (FX çevrimi yok). · Kanıt: `bank/page.tsx` `currencyMain`/`otherCurrencyRows`, dipnot `:1683`. İç doküman (`NivaDesk_banka_pandle_paypal.md` §10) sunucu tarafında da dokuz ayrı `"GBP"` varsayılanı olduğunu ve PayPal (ikinci para birimi kaynağı) devreye girince bunun "zaten kırık" sayılması gerektiğini söylüyor — dürüst ama gerçek bir sınırlama.

16. **[Yüksek] Banka · Files kütüphanesinden bir dosyayı çöpe atmak/silmek, o dosyanın canlı bir banka fişi olup olmadığını hiç kontrol etmiyor** · Owner kütüphaneyi temizlerken "✓ Fiş eşleşti" yazan bir işlemi sessizce kırabilir; sabit silmede (hard delete) depo nesnesi de yok oluyor, işlem daha sonra açıldığında uyarı vermeden başarısız oluyor. · Kanıt: `functions/filesLibrary.js:371-378` (`trashLibraryFile`) ve `:388-410` (`deleteLibraryFile`) hiçbir yerde `bankTransactions.receiptFileRecordId`'ye bakmıyor (repo-geneli grep: `receiptFileRecordId` filesLibrary.js'de sıfır eşleşme). Koruma tek yönlü: `bankFeed.js:825-829` sadece zaten-çöpteki bir dosyanın EKLENMESİNİ reddediyor, tersi (ekliyken çöpe atma) korunmuyor.

17. **[Orta] Banka · Purge, Storage'daki fiş dosyalarına hiç dokunmuyor** · Bir bağlantı tamamen silindiğinde (`bankDeleteConnection` mode=purge, `:766-793`) token+tüm `bankTransactions`+(PayPal ise)`paypalPayouts` siliniyor ama `bank_receipts/{transactionId}/...` altındaki dosyalar kalıcı olarak yetim kalıyor — kullanıcıya görünmez ama depolama hijyeni sorunu.

18. **[Orta/Kontrol] Banka · Ne TrueLayer ne PayPal tarafında sağlayıcı-taraflı bir "izni geri al" çağrısı yok (Square'de var)** · "Bağlantıyı kes"/"Sil" sadece NivaDesk'in kendi kopyasını siliyor; TrueLayer/PSD2 rızası bankanın/TrueLayer'ın kendi panelinde ayrıca iptal edilmedikçe teknik olarak canlı kalabilir. PayPal zaten OAuth olmadığı için (madde 33) aynı client id/secret'ı tekrar girmek hiçbir PayPal onay ekranı olmadan anında yeniden bağlanıyor. · Kanıt: `bankFeed.js` tam metninde `"revoke"` kelimesi sıfır eşleşme. Square agent'ı karşılaştırma için gerçek `/oauth2/revoke` çağrısını doğruladı (`commerce/square/oauth.js:69-79`).

19. **[Orta] Banka · Toplu inceleme sunucu tarafında var, native'de her iki platformda da ölü kod** · `bankSetTransactionCategoryBulk`/`bankSetReviewStatusBulk`/`bankSetTransactionVatBulk` web'de kullanılıyor ama iOS/Mac'te (`BankFeedActions.swift:221-226`) ve Android'de (`StudioFlowRepository.kt:3691-3692`) tanımlı fonksiyonların **hiçbir çağıran yeri yok**; toplu VAT sarmalayıcısı native'de hiç yok. 50 kategorisiz işlemi olan bir native kullanıcı her birine tek tek dokunmak zorunda.

20. **[Orta] Banka · Android bağlantıyı kesemez/silemez, iOS/Mac yapabiliyor** · Android'de `ConnectionRow` sadece "Reconnect" gösteriyor (`BankSpendingScreen.kt:1395-1450`), Disconnect/Purge hiçbir yerde yok; `bankDeleteConnection` Android kod tabanında tek bir referansla tanımlı, hiç çağrılmıyor. Bu bilinçli bir platform kararı olarak dokümante edilmiş (`docs/DURUM.md:504`) ama notta bunun iOS'a göre bir **asimetri** olduğu belirtilmiyor (iOS aynı turda tam yetkiyle geldi).

21. **[Düşük] Banka · Kategori kaydı yönetimi (özel kategori, Pandle/QB/Xero eşlemesi) her iki native'de de bilinçli olarak web-only** · Kod içi yorumlarla açıkça belgelenmiş (`EGGcraft/BankInsights.swift:47-49`, Android `StudioBankModels.kt:217-219`) — kasıtlı, düşük öncelik.

22. **[Düşük] Banka · `docs/banking-roadmap.md` güncelliğini yitirmiş** · Split işlem ve tekrarlayan-fiyat-değişikliği uyarılarını hâlâ "başlanmadı (P1)" gösteriyor, oysa ikisi de üretimde ve testlerle kanıtlı (`bank/page.tsx:867-905`, `banking-links.mjs` §1; `docs/DURUM.md:487-490`).

23. **[Orta] Banka · Native (Swift/Kotlin) tarafında banka için hiç otomatik test yok** · `find EGGcraft -iname "*Test*"` sıfır sonuç; Android'de sadece 2 test dosyası var, ikisi de bankayla ilgisiz (`HomeGridLayoutTest.kt`, `FinanceEngineVectorsTest.kt`). Kategorileştirme/VAT/split/iade matematiğindeki bir native regresyon hiçbir otomatik ağ tarafından yakalanmaz.

24. **[Düşük/Bilgi] Banka · Sunucu test kapsamı, dosya başına tek satır** · `bank-consent.test.js` (5 senaryo, "sabah kopması" düzeltmesini sabitliyor), `banking-core.mjs` (~45 iddia: deterministik id, pending→booked, VAT/inceleme, kategori CRUD+yeniden adlandırma), `banking-links.mjs` (29 iddia: split doğrulama, eşleştirme akışları, çift-ödeme-yok garantisi, çöp-dosya reddi), `banking-b3.mjs` (11 iddia: kural önceliği, disconnect≠purge), `bank-sync-first-imported-emulator.test.js` (gerçek emülatörde `firstImportedAt` regresyonu + Square-payout otomatik eşleşme). Kapsanmayan: UI render, push bildirim teslimi, Files-çöp etkileşimi, herhangi bir native kod.

### Yerleştirme (Settlement Matching — Square + PayPal ortak)

25. **[Kritik] Ortak · PayPal para-transferi (withdrawal) çifte sayım riski hâlâ kapalı bir döngü değil** · Bir satış önce PayPal-kaynaklı bir satır olarak, sonra PayPal bakiyesi gerçek bankaya aktarıldığında TrueLayer tarafında İKİNCİ bir gelen satır olarak görünür; ikisini birbirine bağlayan otomatik eşleştirme (`matchAll`, her senkrondan sonra çalışıyor, `bankFeed.js:703-706,1781`) başarısız olursa (belirsiz aday, FX farkı, ±3 gün penceresi dışı, veya 120 günü geçmiş) ikinci satır sıradan "sınıflandırılmamış gelir" olarak kalır ve biri (kural/elle eşleştirme) onu gerçek gelir sanıp sipariş ödemesine bağlarsa aynı satış iki kez sayılır. · Kanıt: Ekibin kendi iç mühendislik dokümanı bunu "en önemli yapısal sorun" ilan ediyor (`NivaDesk_banka_pandle_paypal.md` §10, "Çifte sayım... feed herkese açılmadan önce çözülmeli") + kod: `settlementMatch.js:12,68-69` otomatik tarama sadece son 120 güne bakıyor, `matchProviderPayouts` (`:66-83`) eşleşmeyen/belirsiz payout için **hiçbir bildirim göndermiyor** (`notifyCompany` çağrısı yok — banka senkron hatalarının aksine, `bankFeed.js:560-571`). · Kontrol: Doküman 1 Eylül tarihli, `settlementMatch.js`'nin PayPal desteği 2 Eylül'de eklenmiş görünüyor (`ls -la` mtime) — mekanizma artık VAR ama yukarıdaki başarısızlık modları kapatılmamış; ekibe bu riskin "yeterince kapalı" sayılıp sayılmadığı sorulmalı.

26. **[Onay] Ortak · Eşik değerleri doğrulandı: otomatik eşleşme skor≥85, ikinciyle fark≥15** · `commerce/settlements.js:20-21` (`AUTO_MATCH_SCORE=85`, `AUTO_MATCH_MARGIN=15`); skor = 100 − gün_farkı×15, +20 sağlayıcı anahtar kelimesi, +25 referans eşleşmesi, üst sınır 150; sadece ±3 gün penceresinde, tutar (0.005 tolerans) ve para birimi tam eşleşiyorsa aday bile olabiliyor.

27. **[Onay] Ortak · Yanlış eşleşme parayı UYDURMUYOR, sadece etiketliyor — ama bu da ciroyu gizleyebilir** · `writeMatch` (`settlementMatch.js:42-49`) hiçbir tutara dokunmuyor, sadece `bankMatch`/`settlement`+`incomingKind:"payout"` yazıyor. Geri alma tam çalışıyor: `matchPayoutToBank` mode=`unlink` → `unmatchPayout`/`clearMatch` (`:52-63,128-135`) temiz bir şekilde "sınıflandırılmamış gelir" durumuna döndürüyor; `bankUpdateTransaction`'da `incomingKind` elle değiştirilirse de otomatik `unmatchTransaction` tetikleniyor (`bankFeed.js:1184-1187`).

28. **[Orta] Ortak · Elle onay (`confirmMatch`) ±3 günlük pencere kısıtını uygulamıyor** · Sadece tutar/para birimi/satırın-boşta-olması kontrol ediliyor (`settlementMatch.js:111-126`) — otomatik geçit (85/15/3-gün) burada yok. Gerçek risk, web/native arayüzünün kullanıcıya `suggestForPayout`'un önerdiği (zaten pencereli) adaylar dışında rastgele bir işlem seçtirip seçtirmediğine bağlı. · Kontrol: UI akışını doğrula.

29. **[Düşük] Ortak · Stripe için anahtar-kelime kodu var ama sağlayıcı olarak hiç kayıtlı değil** · `settlements.js`'deki `PROVIDER_KEYWORDS.stripe` ölü kod; `settlementMatch.js:8`'deki `PROVIDERS` sadece `square`/`paypal` içeriyor — "PayPal ve Stripe aynen yeniden kullanır" yorumuna rağmen canlı Stripe yerleştirme desteği yok.

### Square

30. **[Kritik] Square · İadeler kayıtlı ciro/kârı hiç düşürmüyor** · Bir Square satışı iade edildiğinde, sipariş finans motorunun okuduğu her yerde (kâr raporu, dashboard) sipariş HÂLÂ tam orijinal tutarıyla gelir olarak sayılıyor. · Kanıt: `functions/commerce/envelopeToOrder.js:12` (`PAID_STATUSES` "refunded"/"partially_refunded" içeriyor), `:80` (`paid = PAID_STATUSES.has(payment_status) ? total : 0` — düşülmemiş tam tutar kullanılıyor), `:89` (`paidAmount: paid`, `refundedAmount` alanı HİÇ yazılmıyor); `finance/engine.js:264` (ciro = paidAmount+remainingAmount), `:268` (`refunded = order.refundedAmount` — hiç dolmayan bir alanı okuyor). Karşılaştırma: banka-kaynaklı iadeler (`bankLinkRefundToOrder`, `bankFeed.js:1876-1878,1920-1921`) bunu DOĞRU yapıyor — para modeli sağlam, sadece Square/Woo/Etsy/Shopify'ın paylaştığı adaptör katmanı onu kullanmıyor. · Kontrol: Aynı kök neden Woo/Etsy/Shopify siparişlerini de etkiliyor olabilir (bu denetimin kapsamı dışında, ayrıca kontrol edilmeli).

31. **[Yüksek] Square · Tek bir ortam sırrı TÜM şirketleri aynı anda etkiliyor** · `SQUARE_ENVIRONMENT` bağlantı-başına değil, tek bir paylaşılan Cloud Functions sırrı — biri değiştirilirse mevcut tüm bağlantılar aynı anda kırılır (güvenli tarafa düşüyor: sessiz karışma değil, toplu `reconnect_required`). · Kanıt: `squareConnector.js:89`; bağlantı dokümanındaki `data.environment` sadece görüntüleme amaçlı, hiç geri okunmuyor.

32. **[Yüksek] Square · Bağlantı 24 saatten uzun süre kırık kalırsa "Sync now" bile geriye o kadar bakmıyor** · Zamanlanmış tarama VE elle zorlanan senkron ikisi de 24 saatlik pencereyle sınırlı; boşluk ancak elle "Missing order audit" çalıştırılırsa kapanıyor, sistem bunu proaktif göstermiyor. · Kanıt: `commerce/cursors.js:8-9` (`DEFAULT_MAX_WINDOW_MS=24s`), `squareConnector.js:552,810`.

33. **[Yüksek] Square · Tek bir sipariş-arama hatası, o turdaki ödeme/iade/payout/olay kurtarmasının TAMAMINI sessizce atlıyor** · `reconcileOrders`'ın `searchOrders` çağrısı try/catch'siz — geçici bir 429/500 tüm `reconcileConnection` turunu daha başlamadan iptal ediyor. · Kanıt: `squareConnector.js:559` (korumasız) vs `:768,770,772,780` (her biri kendi try/catch'inde).

34. **[Yüksek] Square · Bağlantı kesmede Square'in izni geri alma çağrısı başarısız olursa sessizce yutuluyor, arayüz her zaman "başarılı" diyor** · `revokeToken` hatası sadece `console.warn`; fonksiyon yerel token'ları yine de siliyor, `revoked` alanı hiçbir istemcide okunmuyor. · Kanıt: `squareConnector.js:286-299`; `SquareIntegrationSection.tsx:376`, `SquareIntegrationView.swift:467-471`.

35. **[Orta] Square · Events API kurtarması 27 günden eskiyi sessizce vazgeçiyor, bunu normal bir turdan ayırmıyor** · `recoverEvents` penceresi 27×24s ile sınırlı (Square'in 28 günlük sınırının hemen altı) — bağlantı bundan daha uzun kırık kalırsa o aralık kalıcı olarak kurtarılamaz hale geliyor, bu ayrı bir bayrakla işaretlenmiyor. · Kanıt: `squareConnector.js:705-748`, `commerce/capabilities.js` (`window_days:28`).

36. **[Orta] Square · Payout durumu webhook değil, sadece saatlik yoklamayla güncelleniyor** · `payout.*` webhook olayı hiç dinlenmiyor — bir payout'un durumu (ve dolayısıyla yerleştirmeye uygunluğu) siparişlere/ödemelere göre çok daha yavaş güncellenebiliyor. · Kanıt: `squareConnector.js:59-61` (event set'lerinde payout yok), `:47,653` (`PAYOUT_PASS_MIN_INTERVAL_MS=1s`).

37. **[Orta] Square · Native (Mac/iPhone, Android) İçe Aktarma Önizlemesi'nde hangi siparişlerin etkileneceğini gösteren örnek liste hiç yok** · Web bir tablo gösteriyor, native sadece toplam sayıları — kullanıcı Import'a basmadan önce hangi siparişlerin değişeceğini native'de göremiyor. · Kanıt: `SquareIntegrationSection.tsx:238-246` vs `SquareIntegrationView.swift:365-374`, Android `StudioFlowRepository.kt:1039-1043`. Bunun dışında her callable (bağlan, ayarlar, senkron, içe aktar, eşleşmemiş inceleme, payout'lar, yerleştirme, denetim, bağlantı kes) her iki native platformda birebir mevcut.

38. **[Orta] Square · Aynı gerçek Square hesabı iki farklı NivaDesk şirketine bağlanabiliyor, tekillik kontrolü yok** · Webhook aynı olayı her iki bağlantıya da fanlıyor — kiracılar arası veri sızıntısı değil (sipariş id'leri şirkete özel) ama aynı gerçek satış iki ayrı işletmenin defterinde birden gelir olarak kaydedilebilir. · Kanıt: `squareConnector.js:64` (`connectionDocId` şirket+merchantId), `:469-473` (`connectionsForMerchant` şirket filtresi yok). · Kontrol: Bu senaryo bilinçli mi (alt-marka desteği) yoksa engellenmeli mi?

39. **[Düşük] Square · İşlem başına Square komisyonu (`processingFee`) hiçbir tabloda gösterilmiyor** · Sadece payout toplamında görünüyor, işlem listesinde yok. · Kanıt: `commerce/adapters/square.js:261`, `squareConnector.js:892-897` projeksiyonu bu alanı atlıyor.

40. **[Düşük] Square · "Sync now" spam'ine karşı 3 dakikalık kilit var, ek bir yeniden-deneme/backoff yok** · `client.js`'de tek dayanıklılık mekanizması 401→token yenile→tekrar dene; 429 sadece sınıflandırılıp fırlatılıyor. Mash koruması ayrı bir mekanizmayla sağlanıyor. · Kanıt: `commerce/square/client.js:35-46`; `squareConnector.js:55,807-808` (`SYNC_LOCK_MS=3dk`).

41. **[Onay] Square · Test kapsamı olağanüstü geniş (4 dosya) ama bu Kritik iadeyi kaçıran tam da bu testler** · Hiçbir iade testi `order.paidAmount`/`refundedAmount` iddiası içermiyor, sadece `payment_status`/görüntü metni kontrol ediliyor. · Kanıt: `commerce-square-connector-emulator.test.js:319-341`.

### PayPal

42. **[Yüksek] PayPal · Sandbox test verisi canlı şirketin defterine kalıcı olarak karışabilir** · Farklı kimlik bilgileriyle yeniden bağlanmak (Sandbox↔Live) AYNI bağlantı doküman id'sini ve `accountId`'yi yeniden kullanıyor, hiçbir satır hangi ortamdan geldiğini işaretlemiyor — eski sandbox satırları gerçek gelirden ayırt edilemez hale geliyor, temizleme yolu yok. · Kanıt: `bankFeed.js:1760-1761` (arama ortamı yok sayıyor), `1579` (`paypalAccountId` sadece connectionId'ye bağlı), `normalize.js:75-92` (satırda `environment` alanı yok); UI Sandbox'ı önce denemeye açıkça davet ediyor (`PayPalIntegrationSection.tsx:62`).

43. **[Yüksek] PayPal · Tanınmayan işlem-kodu (T-code) hiçbir iz bırakmadan kayboluyor** · Kod tablosunda olmayan bir `transaction_event_code` öneki sessizce "skip" oluyor, hiçbir yerde loglanmıyor; senkron başına "görülen" sayacı hesaplanıyor ama hiçbir çağırana/arayüze döndürülmüyor. · Kanıt: `normalize.js:37-38`, `bankFeed.js:592-618` (`seen` toplanıyor ama `paypalConnect`'in döndürdüğü nesnede yok, `:1782`).

44. **[Orta] PayPal · Kişisel (business olmayan) hesap tespiti/uyarısı hiç yok** · 401 (yanlış kimlik) ile 403 (Transaction Search kapalı/kişisel hesap) aynı genel mesajı veriyor — owner asıl engelin hesap türü olduğunu asla öğrenemeyebilir. · Kanıt: `bankFeed.js:1756-1758`; repo genelinde `"business"`/`"personal"` sıfır eşleşme.

45. **[Orta] PayPal · Tek geçişte tek hata, o ana kadar çekilen TÜM sayfaları çöpe atıyor** · `transactionsBetween` döngüsü bitmeden hiçbir yazma yapılmıyor; son 31-günlük dilimde geçici bir hata tüm turu sıfırdan başa sarıyor (kalıcı veri kaybı yok, id-bazlı upsert sayesinde, ama tekrar iş + gecikme var). · Kanıt: `bankFeed.js:592-618`.

46. **[Orta] PayPal · 6 aylık ilk-içe-aktarma sınırı dürüstçe belirtiliyor ama daha eski geçmişi istemenin bir yolu yok** · `PAYPAL_INITIAL_DAYS=180` PayPal'in gerçek ~3 yıllık sınırının çok altında; VAT/muhasebe mutabakatı için "daha fazla geçmiş getir" düğmesi hiçbir yerde yok. · Kanıt: `bankFeed.js:577`.

47. **[Yüksek] PayPal · Komisyon (fee) veri modelinde var ama HİÇBİR toplamda düşülmüyor, sadece tek bir işlemin çekmecesinde görünüyor** · `feeAmount`/`netAmount` (`normalize.js:90-91`) web'de yalnızca o tek işlemin detay panelinde bilgi amaçlı gösteriliyor (`bank/page.tsx:3534-3535`); `spentTotal`/`incomingTotal`/kategori kırılımı/tekrarlayan-ödeme toplamları hep ham `amount` (brüt) kullanıyor, komisyon hiçbir yerde ayrı bir gider kalemi olarak da yazılmıyor. Sonuç: PayPal satışlarının gerçek maliyeti (komisyon), her toplu rapor ve dashboard'da sistematik olarak görünmez — kâr olduğundan yüksek raporlanıyor.

48. **[Orta] PayPal · Web ayarlar kartı, native'lerin gösterdiği "yakın" FX/komisyon eşleştirme önerilerini düşürüyor** · Sunucu `suggestForPayout`'ta "near" (yakın tutar, muhtemel FX/komisyon bacağı) adayları hesaplayıp döndürüyor; web bunu hiç okumuyor/göstermiyor, Swift ve Android ikisi de gösteriyor — nadir ters-yönlü bir native>web parite farkı. · Kanıt: `settlementMatch.js:104-107`; `PayPalIntegrationSection.tsx`'te `.near` sıfır eşleşme; `PayPalIntegrationView.swift:84-86`, Android `StudioFlowRepository.kt:1052,1092,1124`.

49. **[Düşük] PayPal · Salt-okunur garanti bir OAuth kapsamına değil, kod disiplinine dayanıyor** · İstek gövdesinde hiç `scope` alanı yok (`client.js:48-54`); token'ın gerçek yetkisi tüccarın kendi PayPal uygulamasında etkinleştirdiği ürünlere bağlı — NivaDesk'in "salt-okunur" iddiası sadece kodun Transaction Search dışında hiçbir uca hiç dokunmamasına dayanıyor. UI'da bu konuda hiçbir açıklayıcı metin de yok (Banka ve Square'in aksine — bkz. madde 5).

50. **[Düşük] PayPal · Tek-durum-kısıtı kodu üretimde hiç kullanılmıyor, test edilmemiş** · `listTransactions` birden fazla `transaction_status` göndermeyi doğru şekilde reddediyor ama tek üretim çağrı noktası `statuses` parametresini hiç geçmiyor — her senkron 4 durumun tümünü çekip son filtrelemeyi `normalize.js`'e bırakıyor. · Kanıt: `client.js:59`, `bankFeed.js:598`.

51. **[Onay] PayPal · Native parite alışılmadık derecede iyi** · Bağlan, senkron, bağlantı kes, payout listesi, yerleştirme öner/onayla/kaldır, iade ipucu, kaynak filtresi, komisyon/net gösterimi — hepsi hem Swift hem Kotlin'de mevcut (`PayPalIntegrationView.swift`, `SettingsScreen.kt`, `StudioFlowRepository.kt`). "Bağlan" burada da web-only değil.

52. **[Orta] PayPal · Test kapsamı tam da en riskli noktalarda boş** · `commerce-settlements.test.js` PayPal'e özgü anahtar-kelime puanlamasını hiç test etmiyor (sadece Square kurgusu kullanıyor); PayPal için 429/hız-sınırı sınıflandırma testi yok; tanınmayan bir T-code veya GBP-dışı bir para birimi hiçbir test dosyasında yok (her kurgu `"GBP"` sabit).

---

**Özet:** 2 Kritik (Square iade→kâr, PayPal transfer çifte-sayım riski), ~15 Yüksek, ~20 Orta, ~10 Düşük/onay — toplam 52 kanıtlı bulgu. En acil üç madde: (30) Square iade kâr hesabına yansımıyor, (25) PayPal transfer çifte-sayım koruması başarısız olduğunda sessiz kalıyor, (1) `bank_feed` planı sunucuda hiç zorlanmıyor.

---

# 6) MUHASEBE: QUICKBOOKS · XERO · PANDLE


Denetim `functions/accounting/*`, `functions/accountingFunctions.js` (1073 satır), `functions/pandle.js` (879 satır), `firestore.rules`, üç test paketi, web (`QuickBooksIntegrationSection.tsx` 772 satır, `PandleCard.tsx` 456 satır, `integrations.ts`), EGGcraft (Swift) ve studioflow-android (Kotlin) kaynak taraması ile `docs/DURUM.md`'nin bugünkü (3 Eylül 2026) kayıtlarına dayanıyor. En önemli çerçeve bulgusu baştan söylenmeli: **posting (defter yazımı) üç sağlayıcıda da yok** — bu dürüstçe iletiliyor ama denetimin "para-kritik" sorularının çoğunu bugün için teorik kılıyor.

---

### A) Akış haritası

**QuickBooks Online**
1. `quickbooksConnectStart` → tek kullanımlık state (10 dk TTL, `accountingConnectStates`) + Intuit authorize URL (sandbox/production connect-anında seçilir)
2. Callback: code+state+realmId → state tek kullanımlık tüketilir → Basic-auth token exchange → `companyInfo` okunarak realm doğrulanır (query değil, token'ın okuyabildiği realm esas)
3. `connectionId = quickbooks_online__{realmId}`; kök `accountingRealms/{provider}__{realmId}` → companyId eşlemesi (server-only, istemci hiç okuyamaz)
4. Katalog: `Account/TaxCode/TaxRate/Customer/Vendor/Item` `queryAll` (SQL-benzeri, 1000'lik sayfalar) → `accountingIdentities` + `accountingCatalog`; CDC cursor'ları "şimdi"den başlar
5. Eşleme: `accountingMappingSuggestions` (isim/subType skorlu kural motoru) → `accountingSaveMappings` (yalnız owner); 8 VAT anahtarı (ZR≠EX doğru ayrılmış, IM/MX yok)
6. Webhook: CloudEvents dizisi + `intuit-signature` HMAC (ham gövde, timing-safe) → `accountingInbox`'a `.create()` ile tekilleştirme → ilk 40 olay satır-içi işlenir, gerisi sweep'e kalır
7. CDC/reconcile: `changedSince` ile 30 gün geriye; NivaDesk'in postaladığı bir belge sağlayıcıda değişmişse (henüz olmuyor) asla üzerine yazılmaz, Needs Attention açılır
8. Zamanlama: `scheduledAccountingReconcile` her 6 saatte (300 bağlantı sınırı) + manuel "Sync now"
9. Posting: `previewPosting`/`postDocument` → `posting_not_available_yet`; arayüz "Ready to post: 0" yanında "Read-only phase" notunu açıkça gösterir
10. Bugünkü canlı durum: sandbox bağlantı+katalog+mapping onayı doğrulandı; webhook create/edit olaylarından ~20 dk sonra Intuit'ten hiç istek gelmedi, CDC farkı kapattı (`docs/DURUM.md:1847`)

**Xero**
1. `xeroConnectStart` → tek kullanımlık state + salt-okunur (read) scope authorize URL; yazma scope'u Faz 3'e ertelenmiş, bugün kod içinde hep `"read"` sabit
2. Callback: code → token exchange → `/connections` ile consent'in kapsadığı organizasyonlar listelenir; tek organizasyon otomatik bağlanır, birden çoksa 15 dk'lık seçim ekranı (`xeroListTenants`/`xeroSelectTenant`)
3. Bir "grant" (consent) birden çok `tenantId`'yi paylaşabilir → `tokenDocId = xero_grant__{authEventId}`; `connectionId = xero__{tenantId}`; aynı desende kök `accountingRealms`
4. Katalog: tek bir Contacts okuması hem customer hem vendor'ı besler (Starter 1.000 çağrı/gün bütçesi için); Accounts/TaxRates/Items 100'lük sayfalarla
5. Eşleme: Xero UK chart'ına özel kural seti (OUTPUT2/ZERORATEDOUTPUT/…); aynı 8 VAT anahtarı, IM/MX yok
6. Webhook: yalnız Contact/Invoice/CreditNote/Overpayment/Prepayment; `x-xero-signature` HMAC (ham gövde, timing-safe); boş olay dizisi = intent-to-receive (200/401, 5 sn); olay id'si Xero'dan gelmiyor, türetiliyor
7. CDC/reconcile: If-Modified-Since (webhook'suz Payment/BankTransaction/BankTransfer dahil); scope yetmeyen varlık `skipped` olarak atlanır, asla tahmin edilmez
8. Zamanlama: aynı ortak 6 saatlik sweep + manuel Sync now
9. Posting: yok (aynı ret)
10. Bugünkü canlı durum: app+3 secret+ITR handshake (200/401) doğrulandı; gerçek bir organizasyonla uçtan uca OAuth bağlantısı `docs/DURUM.md:1867`'ye göre henüz TAMAMLANMADI — QuickBooks'tan daha geride

**Pandle**
1. `pandleConnectStart` → OAuth2 authorization-code (Pandle destek ekibinin verdiği app id/secret); `state` TTL'siz olarak `pandleConnection/main`'e yazılır
2. `pandleConnectFinish`: code+state → token exchange → şirket listesi çekilir; banka hesabı otomatik seçilir (en kalabalık "Check" kuyruğu) ya da elle — **tek bankAccountId**, PayPal/ikinci hesap kavramı yok
3. Katalog: bank_accounts/bank_transaction_categories/tax_codes (JSON:API, sayfalı); NivaDesk kategorisi → Pandle nominal kod + vergi kodu tablosu (bağlanmadan önce de düzenlenebilir)
4. Önizleme (`pandlePreview`): NivaDesk `bankTransactions` (son 3000, provider filtresi YOK) + Pandle'ın onaysız satırları → greedy eşleştirme (yön+tutar zorunlu, tarih toleransı 2/4 gün); MX ve split işlemler "hazır değil"
5. Gönder (`pandlePush`): `requestId` ile idempotent (`pandleSyncRuns` ledger + satır-başı `pandle.status==="confirmed"` ikinci koruma); Pandle satırı gönderim ANINDA yeniden okunur, yön/tutar/tarih yeniden doğrulanır; MX ve split sunucuda da bloklanır
6. `pandleConfirmMatch`/`pandleRejectMatch`: belirsiz eşleşmeyi kullanıcı onaylar/reddeder; red listesi kalıcı
7. Reconcile/webhook: yok — Pandle'da CDC/webhook kavramı yok, her şey talep üzerine; `scheduledAccountingReconcile` Pandle'ı kapsamıyor
8. "Posting" değil "confirm": Pandle'da yeni kayıt YARATILMIYOR, yalnız bekleyen satır onaylanıyor — tek yönlü
9. Bugünkü canlı durum: kod+kimlik bilgileri canlı; gerçek bir Pandle şirketinde uçtan uca onay **projenin kendi belgesine göre henüz doğrulanmadı** (`NivaDesk_pandle.md:46-49`)

---

### B) Bulgular

**1. [Kritik] Ortak · Posting (Faz 3) hiç yok, ama dürüstçe söyleniyor**
Sorun: QuickBooks/Xero/Pandle'a hiçbir fatura, ödeme veya defter kaydı otomatik yazılmıyor; ürünün "muhasebeyi resmileştirir" vaadi bugün sıfır.
Kanıt: `functions/accounting/quickbooks/adapter.js:60-69`, `functions/accounting/xero/adapter.js:69-70`, `functions/accounting/pandle/adapter.js:64-65` (üçü de `posting_not_available_yet`); `accountingOverview` "Nothing is posted yet, so these are honest zeros" `functions/accountingFunctions.js:1022-1023`; web'de `readOnlyPanel` + "Read-only phase" notu `studioflow-web/app/settings/QuickBooksIntegrationSection.tsx:420-424,473`.
Soru: Bu doğru çerçevelenmiş bir "Faz 1-2" durumu; asıl soru Faz 3'ün ne zaman başlayacağı ve bu denetimdeki fingerprint/state-machine tasarımının o güne kadar hiç gerçek yükle sınanmamış olması.

**2. [Orta] Ortak · 10 KDV kodundan 2'si (IM, MX) hiçbir sağlayıcıya eşlenemiyor**
Sorun: `bankFeed.js`'in 10 kodluk listesi (`ST,RR,ZR,EX,OS,NR,RC,NV,IM,MX`) ile muhasebe katmanının 8 kodluk listesi uyuşmuyor; bir işlem IM/MX ile etiketliyse bu ekranlarda hiç eşleme seçeneği yok.
Kanıt: `functions/bankFeed.js:51` (10 kod) vs `functions/accounting/core/adapter.js:72-81` (8 kod); `accountingSaveMappings` `TAX_KEYS` kontrolü `functions/accountingFunctions.js:894,921-924` — IM/MX denenirse "Unknown VAT mapping" fırlatır; istemci aynısını aynen yansıtıyor `studioflow-web/lib/studioflow/quickbooks.ts:248-256` (tutarlı ama eksik).
Soru: MX'in dışarıda bırakılması kasıtlı ve gerekçeli ("split gerekir", `bankFeed.js:49-51`, `functions/pandle.js:311`); IM için aynı gerekçe yok — verify: IM'nin dışarıda kalması bilinçli mi yoksa Faz 3 öncesi giderilecek bir eksik mi?

**3. [Kritik] Ortak · Token şifreleme anahtarının rotasyon hikâyesi yok, hata da çirkin yüzeyleşiyor**
Sorun: `NIVADESK_QBO_TOKEN_KEY` bir gün değiştirilirse Firestore'daki HER kutulu token kalıcı olarak çözülemez hale gelir; bu olduğunda kullanıcı "Reconnect" düğmesi bile görmez.
Kanıt: `encryptToken`/`decryptToken` kutusu `{v:1,iv,tag,data}` — anahtar-sürüm etiketi yok (`functions/etsy.js:102-127`); `refreshTokenWithLock` içinde `unbox()` çağrıları try/catch'in DIŞINDA (`functions/accountingFunctions.js:169-170`, try `176`'dan başlıyor) — bir decrypt hatası ham Node crypto exception'ı olarak `events.classifyError` (`functions/commerce/events.js:20-38`) tarafından "unknown" sınıflanır → `syncConnection`'ın catch'i (`functions/accountingFunctions.js:613-619`) `syncState:"error"` yazar, `status` "linked" kalır; web'de "Connect again" düğmesi YALNIZCA `status==="reconnect_required"` iken görünür (`studioflow-web/app/settings/QuickBooksIntegrationSection.tsx:447`).
Soru: Kurtarma yolu var (manuel Disconnect → Reconnect, satır 751-755) ama hiç yönlendirilmiyor — bir anahtar rotasyonu provası yapılıp gerçek kullanıcı deneyimi ölçülmeli.

**4. [Yüksek] Ortak · Xero, QuickBooks'un şifreleme anahtarını paylaşıyor**
Sorun: Xero token'ları kendi anahtarıyla değil, `NIVADESK_QBO_TOKEN_KEY` ile kutulanıyor — biri rotasyona girerse diğeri de kırılır; bu depodaki DİĞER her bağlayıcının (Shopify, Woo, Square) aksine bir tasarım.
Kanıt: `functions/index.js:122-124` yorumu "Xero tokens are boxed with the QuickBooks token key"; `createAccountingFunctions(...)` çağrısında `xeroTokenKey` hiç geçirilmiyor (`functions/index.js:6108-6119`) → `tokenKey: xeroTokenKey || qboTokenKey` hep ikinciye düşer. Karşılaştır: Shopify "Its own key, not Etsy's, so the two can be rotated apart" `functions/index.js:100-101`.
Soru: Bilinçli bir kısayol mu (henüz 4. secret istemiyorlar) yoksa unutulmuş mu — `NIVADESK_XERO_TOKEN_KEY` planlanıyor mu?

**5. [Kritik] Pandle · OAuth token'ları Firestore'da düz metin**
Sorun: QuickBooks/Xero/Etsy/Shopify/Woo/Square/PayPal'ın hepsi AES-256-GCM ile kutulanırken Pandle'ın access/refresh token'ı şifresiz yazılıyor; Admin SDK erişimi olan biri (yedek dışa aktarımı, sızmış servis hesabı, konsoldan bakan biri) doğrudan okur.
Kanıt: `functions/pandle.js` içinde "encrypt"/"decrypt" hiç geçmiyor (grep 0 sonuç); `storeTokens` düz `accessToken`/`refreshToken` yazıyor; `createPandleFunctions({admin,onCall,HttpsError,uidIsCompanyOwner})` çağrısı (`functions/index.js:6100`) encrypt/decrypt bağımlılığı almıyor bile. Firestore kuralı istemciyi engelliyor (`firestore.rules:706-708`, `write:false`) ama backend erişimini engellemiyor.
Soru: Diğer 6 bağlayıcıyla aynı `etsy.encryptToken` şemasına taşımak küçük bir iş — önceliklendirilmeli.

**6. [Kritik] Xero · Rotasyonlu refresh token kaybı = kalıcı kopma, 30 dk'lık pencere gerçek**
Sorun: Xero'nun eski refresh token'ı yalnız 30 dk daha geçerli; yeni çift Firestore'a yazılırken bu yazım başarısız olursa (geçici hata) ve bir sonraki deneme 30 dk'dan geç gelirse (6 saatlik sweep kadar geç gelebilir) bağlantı kalıcı olarak kopar — arada hiç "reconnect_required" görünmeden.
Kanıt: "the previous one stays usable for a 30-minute grace only" `functions/accounting/xero/oauth.js:9-12`; rotasyon+kayıt tek `.set()` `functions/accountingFunctions.js:178-182`; yazım hatası "transient" sınıflanırsa (`functions/commerce/events.js` deadline/unavailable eşleşmesi) `syncState:"error"` yazılır, `reconnect_required` DEĞİL (`functions/accountingFunctions.js:185-190`).
Soru: verify — bu tam senaryo (rotasyon başarılı + Firestore yazımı başarısız) hiç test edilmemiş; `functions/test/e2e/accounting-xero-emulator.test.js:293-307` yalnız mutlu yolu (tek zorlanmış refresh) sınıyor.

**7. [Kritik] Pandle · PayPal ayrı banka hesabı olarak modellenmemiş**
Sorun: PayPal kaynaklı işlemler gerçek banka işlemleriyle aynı tek Pandle banka hesabına eşleşip gönderiliyor; PayPal'dan bankaya inen bir payout hem PayPal satırı hem banka satırı olarak iki kez sayılabilir ya da yanlış VAT/nominal koduna düşebilir.
Kanıt: `functions/pandle.js` içinde "paypal" hiç geçmiyor (grep 0 sonuç); `bankFeed.js` PayPal satırlarını `provider:"paypal"` ile 6 ayrı yerde işaretliyor (ör. `functions/bankFeed.js:1765`); `pandlePreview`'in `nivaRows` sorgusu (`functions/pandle.js:~557-565`) provider filtresi olmadan TÜM `bankTransactions`'ı okuyor; `pandleSelectBankAccount` tek `bankAccountId` saklıyor (`functions/pandle.js:517-529`).
Soru: Denetim brifinginde de işaret edilen, kullanıcıya doğrudan görünür bir çift-sayım riski — önceliklendirilmeli.

**8. [Kritik] Pandle · Uçtan uca gönderim projenin kendi belgesine göre hiç canlıda doğrulanmadı**
Sorun: `pandlePush`'un gerçek Pandle onay API'siyle round-trip'i hiç gerçek bir Pandle şirketinde denenmedi; tüm idempotency/eşleşme mühendisliği teoride sağlam ama pratikte sınanmamış.
Kanıt: `NivaDesk_pandle.md:46-49` — "Uçtan uca gönderim (gerçek bir Pandle şirketinde onay) henüz üretimde çalıştırılıp doğrulanmadı."
Soru: Bu denetimin bulacağı en önemli "kod iyi ama kanıtlanmamış" örneği — bir sonraki Pandle fazının ilk maddesi olmalı.

**9. [Kritik] QuickBooks · Webhook bugüne kadar canlıda hiç ateşlenmedi**
Sorun: Gerçek zamanlı senkronizasyon iddiası bugün üretimde doğrulanmamış; NivaDesk yalnızca CDC'ye (6 saatte bir + manuel Sync now) güveniyor.
Kanıt: `docs/DURUM.md:1847` — "oluşturma + düzenleme olaylarından ~20 dk sonra Cloud Run istek günlüğünde Intuit'ten hiç istek yok"; aynı satır CDC'nin farkı kapattığını da doğruluyor ("198 catalogue rows, 1 changes since the last check").
Soru: Takip maddesi zaten yazılı (Intuit konsolunda webhook aboneliğini kaydet-yeniden-kaydet) — bu denetim tarihi itibarıyla hâlâ açık mı, kontrol edilmeli.

**10. [Yüksek] QuickBooks · "Last webhook" boşluğu ana ekranda sağlık sorunu olarak görünmüyor**
Sorun: Bağlantı kartının üstündeki yeşil "Connected" rozeti, webhook hiç gelmemiş olsa da CDC `syncState:"ok"` tuttuğu sürece yeşil kalır; kullanıcı sorunu fark etmesi için Activity sekmesine tıklaması gerekir.
Kanıt: `healthy = connection.status==="linked" && (!connection.syncState || connection.syncState==="ok")` — `lastWebhookAtMs` hiç hesaba katılmıyor (`studioflow-web/app/settings/QuickBooksIntegrationSection.tsx:412`); `ago()` boş değeri sade "—" olarak basıyor (`:88-89`, ana kart `:439`); açıklayıcı "No webhook has arrived yet…" metni yalnızca Activity sekmesinde, gelen kutusu boşken görünüyor (`:722`).
Soru: Ana karta (Overview) bir uyarı rozeti eklenmeli mi — bu tam olarak "gözlemlenen QuickBooks vakası"nın arayüz karşılığı.

**11. [Yüksek] Ortak · Zamanlanmış reconcile 300 bağlantıda sessizce kesiliyor**
Sorun: `scheduledAccountingReconcile` tüm şirketlerdeki QuickBooks+Xero bağlantılarını `limit(300)` ile tarıyor; bu sayı aşılırsa fazlası hiç uyarı vermeden 6 saatlik taramadan düşer.
Kanıt: `db().collection(ROOT_REALMS).where("provider","in",PROVIDER_IDS).limit(300).get()` `functions/accountingFunctions.js:741`; sayfalama/alarm yok.
Soru: verify — bugün kaç canlı bağlantı var (muhtemelen çok altında), ama büyüme planına göre erken bir izleme eşiği konmalı.

**12. [Yüksek] Xero · Türetilmiş webhook olay id'si çakışabilir**
Sorun: Xero olay kimliği sağlanmıyor; `tenantId+entity+id+tip+eventDateUtc`'den hash'leniyor — aynı varlığın aynı saniye içindeki iki ayrı güncellemesi aynı id'yi üretip ikincisi "duplicate" sayılıp sessizce atlanabilir.
Kanıt: `derivedEventId([tenantId, entity, externalId, type, occurredAt])` `functions/accounting/xero/webhook.js:34-35,53`; tekilleştirme `inboxRef.create()` `functions/accountingFunctions.js:646-650`; Xero'nun kendi `firstEventSequence/lastEventSequence` alanı (monoton, tam bu amaç için) yakalanıyor ama olay-bazlı id'de kullanılmıyor.
Soru: verify — `eventDateUtc`'nin gerçek çözünürlüğü (Xero dokümantasyonu bu kod tabanında yok); açık kalsa da 6 saatlik If-Modified-Since sweep nihai durumu yakalıyor, kayıp kalıcı değil.

**13. [Yüksek] Ortak · Rotasyon/eşzamanlılık senaryoları test edilmemiş**
Sorun: Gerçek eşzamanlı refresh yarışı ve rotasyon-sonrası-yazım-hatası hiç sınanmamış; yalnızca ardışık, zorlanmış tek refresh testleri var.
Kanıt: `functions/test/e2e/accounting-quickbooks-emulator.test.js:221-232`, `functions/test/e2e/accounting-xero-emulator.test.js:293-307` — ikisi de tek `force:true` çağrısı. Firestore-transaction kilidi (`functions/accountingFunctions.js:145-167`) tasarım olarak sağlam (gerçek `runTransaction` ile sıralanıyor) ama iki gerçek paralel çağrıyla hiç doğrulanmamış.
Soru: Bulgu #6'nın kanıtlanması için özel bir eşzamanlılık testi yazılmalı.

**14. [Yüksek] Pandle · Token yenilemede kilit yok**
Sorun: QuickBooks/Xero'nun dikkatli Firestore-transaction kilidinin aksine Pandle'ın `accessToken()` fonksiyonu kilitsiz; iki eşzamanlı çağrı (ör. Preview hemen ardından Push) token süresi dolmak üzereyken aynı anda `refresh_token` isteği atabilir.
Kanıt: `functions/pandle.js:147-162` — transaction/lock alanı yok, doğrudan oku-ve-yenile.
Soru: verify — Pandle'ın OAuth sunucusu refresh token'ı her kullanımda rotasyona sokuyor mu (bu kod tabanında belgelenmemiş); rotasyona sokuyorsa kaybeden çağrı "Pandle sign-in failed" ile başarısız olur.

**15. [Yüksek] Ortak · Web'de "native", Mac/iPhone/Android'de "planned" — üç platformda birebir doğrulandı**
Sorun: Native-only bir kullanıcı QuickBooks/Xero'yu hiç bağlayamaz, mevcut bağlantının durumunu bile göremez (jenerik Integrations kartı `accountingConnections`'ı okumuyor).
Kanıt: Web `studioflow-web/lib/studioflow/integrations.ts:100-112` (Pandle "planned", QuickBooks/Xero "native"); Mac/iPhone `EGGcraft/NivaDeskIntegrations.swift:107-112` (üçü de "planned"); Android `studioflow-android/.../IntegrationsHub.kt:167-169` (üçü de "planned"). İç belge bunun bilinçli bir karar olduğunu doğruluyor: "Native yok (web-first, bilinçli)" `docs/DURUM.md:83`.
Soru: Ürün kararı doğru olabilir ama native'deki "Coming soon" etiketi bunun kalıcı bir tasarım kararı olduğunu değil, yakında geleceğini ima ediyor — metin gözden geçirilmeli.

**16. [Orta] Ortak/Pandle · Pandle web'de de "planned" görünüyor, oysa canlı bir kart Banking'de var**
Sorun: Settings → Integrations'a bakan kullanıcı Pandle'ı "Coming soon" sanır; gerçek kart tamamen farklı bir sayfada.
Kanıt: `studioflow-web/lib/studioflow/integrations.ts:100-102` ("planned"); gerçek, 456 satırlık `PandleCard.tsx` yalnız `studioflow-web/app/bank/page.tsx`'te render ediliyor (grep ile doğrulandı). Native'de de yalnız OKUMA var: `EGGcraft/BankSpendingView.swift:87-89,140-143,2069-2084` (pandleStatus/pandleBankTransactionId/pandleLastError gösterimi) + `EGGcraft/FirebaseManager.swift:3815` dinleyici, ama `pandlePush/Preview/ConnectStart/ConfirmMatch/RejectMatch` gibi callable adları EGGcraft veya studioflow-android'de hiç geçmiyor (grep 0 sonuç) — native kullanıcı yalnız izleyebilir, hiçbir eylem yapamaz.
Soru: Integrations hub'daki Pandle satırı en azından "Bank sayfasında" diye yönlendirmeli.

**17. [Orta] Ortak · Mimari doküman kod ile örtüşmüyor**
Sorun: Yeni bir mühendis `docs/accounting-connector.md`'yi okuyup `core/connections.js`, `identities.js`, `events.js`, `postings.js`, `inbox.js`, `attention.js`, `engine.js` arar, bulamaz.
Kanıt: Doküman satır `26-44`; gerçek dizin yalnızca `adapter.js, fingerprint.js, matching.js, store.js` içeriyor (`functions/accounting/core/` listelemesi) — sorumluluklar `store.js` + `accountingFunctions.js`'e toplanmış.
Soru: Doküman güncellenmeli — davranışsal bir risk değil ama onboarding'i yavaşlatır.

**18. [Orta] Ortak · Dokümanın "exponential backoff + jitter" iddiası kodda yok**
Sorun: 429/5xx alan bir senkronizasyon otomatik yeniden denenmiyor; tek kurtarma yolu kullanıcının "Sync now"a basması ya da 6 saatlik bekleme.
Kanıt: `docs/accounting-connector.md:21` iddiası; `functions/accounting/quickbooks/client.js`, `functions/accounting/xero/client.js`, `functions/accountingFunctions.js` içinde "backoff"/"jitter" hiç geçmiyor (grep 0 sonuç).
Soru: Doküman mı düzeltilmeli yoksa retry mantığı mı eklenmeli?

**19. [Orta] Ortak · Hesap/VAT eşlemesi, ledger'da yeniden adlandırma/silmeye karşı doğrulanmıyor**
Sorun: Bir mapping onaylandıktan sonra, o QuickBooks/Xero hesabı sonradan yeniden adlandırılsa veya silinse bile NivaDesk'in gösterdiği isim kaydedildiği andaki gibi kalır; hiçbir yeniden-doğrulama yok.
Kanıt: `accountingSaveMappings` yalnızca KAYIT ANINDAKİ katalog anlık görüntüsüne karşı doğruluyor (`accountsById` haritası `functions/accountingFunctions.js:899-901`, hata mesajı `:906`); `importCatalog` (yeniden senkron) `accountingMappings`'e hiç dokunmuyor (`functions/accountingFunctions.js:481-529` içinde `r.mappings` referansı yok).
Soru: Faz 3 posting'den önce, silinmiş/yeniden adlandırılmış bir hesabı proaktif tespit eden bir kontrol gerekecek.

**20. [Orta] Ortak · Firestore kural deny-list'i elle bakım istiyor (bugün doğru, ileride kırılgan)**
Sorun: Her yeni `accounting*`/`pandle*` alt koleksiyonu hem okuma hem yazma zincirine (`collectionId != '...'`) elle eklenmezse jenerik joker kural devreye girip sıradan üyelere açılır.
Kanıt: `firestore.rules:813-926` — bugün 11 `accounting*` + 3 `pandle*` koleksiyonunun tamamı her iki zincirde de doğru şekilde mevcut (doğrulandı, canlı bir açık yok); kullanıcının kendi hafıza notundaki aynı desen.
Soru: Süreçsel risk — yeni koleksiyon eklerken kontrol listesine alınmalı.

**21. [Orta] Ortak · `bankFeed` üye izni, tüm muhasebe eşleme tablosunu ve denetim günlüğünü de açıyor**
Sorun: Sadece banka verisine erişimi olsun diye yetkilendirilmiş bir ekip üyesi, aynı bayrakla nominal hesap/VAT eşlemelerini ve `accountingAudit` günlüğünü de görebiliyor.
Kanıt: `accountingOverview` ve `accountingSyncActivity` ikisi de `requireReader` kullanıyor (`functions/accountingFunctions.js:1002-1003,1039-1040`) → owner OR `memberAccess[uid].bankFeed===true`; `canReadBankFeed` kuralı bunu birebir yansıtıyor (`firestore.rules:93-96`, `715-753`). Buna karşılık senkron tetikleme/mapping kaydetme/mode değiştirme hep `requireOwner`.
Soru: Ürün sahibiyle doğrulanmalı — "banka özeti görsün" izninin "muhasebeci eşleme tablosunu da görsün" anlamına gelmesi kasıtlı mı?

**22. [Orta] Ortak · Plan/paket bazlı kısıtlama yok**
Sorun: Free/Demo dahil her plandaki şirket bugün QuickBooks/Xero/Pandle bağlayabiliyor.
Kanıt: `functions/accountingFunctions.js` ve `functions/pandle.js` içinde "plan"/"billingPlan"/"planTier" hiç geçmiyor (grep 0 sonuç).
Soru: verify — bilinçli mi (muhasebe her plana açık tutulacak) yoksa unutulmuş bir plan-geçidi mi?

**23. [Orta] QuickBooks · CloudEvents dışı (legacy) webhook biçiminde de türetilmiş id çakışma riski**
Sorun: Legacy `eventNotifications` biçiminde Intuit id vermiyor; `realmId+entity+id+operation+lastUpdated`'dan hash üretiliyor — `lastUpdated` aynı saniyeye denk gelen iki hızlı düzenleme ikincisini "duplicate" gösterip atlayabilir.
Kanıt: `derivedEventId(...)` `functions/accounting/quickbooks/webhook.js:90`; CloudEvents biçiminde Intuit'in kendi `id`'si önceliklidir (`:66`, daha güvenli).
Soru: verify — legacy biçim üretimde hâlâ gerçekten kullanılıyor mu (Intuit varsayılanı CloudEvents).

**24. [Orta] QuickBooks · Oran sınırları tanımlı ama uygulanmıyor**
Sorun: `QBO_LIMITS` (500 istek/dk, realm başına 10 eşzamanlı) sadece dokümantasyon amaçlı sabitler; hiçbir throttle/kuyruk yok.
Kanıt: `functions/accounting/quickbooks/client.js:20`; `request()` fonksiyonunda hız sınırlama mantığı yok (`:53-74`).
Soru: Bugün risk düşük (seri çağrılar) ama çok sayıda eşzamanlı "Sync now" tıklaması senaryosu hiç modellenmemiş.

**25. [Orta] QuickBooks · "Out of scope" ve "Not registered" önerileri aynı koda düşebilir**
Sorun: OS ve NR kuralları neredeyse aynı kelime listesini paylaşıyor; QBO'nun standart İngiltere planında genelde tek bir "No VAT" kodu olduğundan ikisi de aynı dış koda önerilip onaylanabilir.
Kanıt: `functions/accounting/quickbooks/normalize.js:288-289`.
Soru: Muhasebeciyle doğrulanmalı — bu QBO'nun gerçek sınırlaması mı yoksa NivaDesk'in ayrım kaybı mı?

**26. [Orta] Xero · Gün başına çağrı limiti telemetrisi toplanıyor ama hiç kullanılmıyor**
Sorun: "1001. çağrı"da proaktif bir uyarı/erteleme yok; istek sıradan gönderilir, 429 alınır, jenerik "could not be read" hatası döner — "bugünkü Xero limitine takıldınız, yarın deneyin" mesajı yok.
Kanıt: `lastLimits` (`dayRemaining/minuteRemaining/appMinuteRemaining`) her yanıtta güncelleniyor (`functions/accounting/xero/client.js:66-74`) ama `functions/accounting/`, `accountingFunctions.js`, `index.js` içinde başka hiçbir yerde okunmuyor (grep 0 sonuç).
Soru: En azından hata mesajına `X-Rate-Limit-Problem`/`Retry-After` bilgisini taşımak ucuz bir iyileştirme olur.

**27. [Orta] Xero · Scope yetersizliği (403/scope) arayüzde görünmüyor**
Sorun: Sunucu scope eksikliğini doğru ayırt ediyor (`skipped:[{entity,reason:"scope"}]`) ama web'de buna karşılık bir "Update permissions" eylemi yok; kullanıcı sessizce daha az varlık senkronlandığını fark etmeyebilir.
Kanıt: `scopeProblem` ayrımı `functions/accounting/xero/client.js:35`; `skipped.push` `functions/accounting/xero/adapter.js:104-105`; `studioflow-web/app/settings/QuickBooksIntegrationSection.tsx` içinde "Update permissions" hiç geçmiyor (grep 0 sonuç).
Soru: Reconciliation sekmesinde `skipped` listesi zaten okunuyor mu, yoksa tamamen mi düşüyor — ayrıca doğrulanmalı.

**28. [Orta] Pandle · OAuth `state`'in süresi yok**
Sorun: Terk edilmiş bir Pandle bağlama denemesinin `state` değeri süresiz geçerli kalır (accounting/core'un 10 dk TTL'li havuzunun aksine).
Kanıt: `pandleConnectStart` `state`'i doğrudan `pandleConnection/main`'e yazıyor, TTL alanı yok (`functions/pandle.js:414-430`); `pandleConnectFinish` yalnız `existing.state !== state` kontrolü yapıyor (`:433-450`).
Soru: Düşük pratik risk (yine de Pandle'ın kendi `code`'unun hızlı süresi dolar) ama depodaki diğer desenle tutarsız.

**29. [Orta] Pandle · Çift bağlanma denemesi ilkini sessizce geçersiz kılar**
Sorun: `state`, tek `pandleConnection/main` dokümanının üzerine yazıldığı için art arda iki "Connect" tıklaması ilk denemeyi "stale" hatasıyla düşürür.
Kanıt: `functions/pandle.js:414-422` (üzerine yazma), hata mesajı `:436`.
Soru: Güvenli başarısızlık (yetkisiz erişim yok), yalnız UX pürüzü — düşük öncelik.

**30. [Orta] Pandle · IM için de fallback yok**
Sorun: IM etiketli bir işlem Pandle'a asla eşlenemiyor — bulgu #2'nin Pandle karşılığı.
Kanıt: `TAX_CODE_FALLBACKS = { ZR:[...], OS:[...], NR:[...], IM:[] }` `functions/pandle.js:62` — boş dizi.
Soru: Bulgu #2 ile birlikte ele alınmalı.

**31. [Orta] Ortak · Göç (migration) iki ayrı yazım, tek işlem değil**
Sorun: `accountingPlanMigration` önce Pandle'ı `migration_read`'e, sonra yeni bağlantıyı `primary_write`'a çeviriyor — aradaki süreçte işlem çökerse şirket geçici olarak "hiç birincil yazıcısı olmayan" durumda kalabilir.
Kanıt: İki ayrı `setMode` çağrısı, batch/transaction değil (`functions/accountingFunctions.js:876-886`).
Soru: Düşük olasılık, kolay kurtarılır (göçü yeniden çalıştır) — yine de tek `runTransaction`'a taşınabilir.

**32. [Orta] Ortak · Tek-yazıcı kuralı tasarım olarak sağlam ama gerçek yazımla hiç sınanmadı**
Sorun: `store.primaryWriterConflict` doğru mantıkla iki `primary_write`'ın örtüşmesini engelliyor, ama bugüne kadar hiçbir gerçek posting bu kapıdan geçmedi (bulgu #1 nedeniyle) — kapının "gerçek yükte" davranışı doğrulanmamış.
Kanıt: `functions/accounting/core/store.js:74-95`; çağrı yeri `functions/accountingFunctions.js:852-868`; her sağlayıcının mapping/katalog durumu `connectionId` ile anahtarlanıyor, çapraz kirlenme yok (doğrulandı).
Soru: Faz 3 öncesi bir entegrasyon testi ile (gerçek posting simülasyonu) teyit edilmeli.

**33. [Orta] Ortak · Sabitler dört platformda elle senkron tutuluyor**
Sorun: `TAX_MAPPING_KEYS`/`ACCOUNT_MAPPING_KEYS` (sunucu ↔ web) ve entegrasyon "planned/native" listesi (web ↔ iOS/Mac ↔ Android) hiçbir ortak kaynaktan gelmiyor, otomatik drift testi yok — bugün tutarlı (elle doğrulandı) ama gelecekteki bir değişiklik sessizce ayrışabilir.
Kanıt: `functions/accounting/core/adapter.js:72-81` ↔ `studioflow-web/lib/studioflow/quickbooks.ts:248-256` (bugün özdeş); `integrations.ts:100-112` ↔ `NivaDeskIntegrations.swift:107-112` ↔ `IntegrationsHub.kt:167-169` (bugün özdeş).
Soru: Bu tür sabitler için basit bir "diff" testi (`accounting-core.test.js`'e benzer) düşünülebilir.

**34. [Düşük] Ortak · `BANK_MATCH_STATUSES` ölü kod**
Sorun: Yok — yalnızca ileri faz için hazırlanmış, hiçbir yerde atanmıyor.
Kanıt: `functions/accounting/core/adapter.js:39-41`; tanım/export dışında grep sonucu yok.
Soru: Bilgi amaçlı, aksiyon gerekmiyor.

**35. [Düşük] QuickBooks · `minorversion=75` sabit, izlemesiz**
Sorun: Intuit ileride bu sürümü kaldırırsa fark edilmesi tamamen elle olur.
Kanıt: `functions/accounting/quickbooks/client.js:14` — "verified against the developer portal on 2 Sep 2026".
Soru: Düşük öncelik, yalnızca ileriye dönük not.

**36. [Düşük] Xero · `xeroSecretValue` farklı bir erişim deseni kullanıyor**
Sorun: Diğer secret'lar `.value()` ile okunurken Xero doğrudan `process.env[name]` okuyor — bugün çalışıyor (Firebase secret'ı env'e enjekte ediyor) ama tutarsız.
Kanıt: `functions/index.js:120` (`xeroSecretValue`) vs `NIVADESK_QBO_CLIENT_ID.value()` `functions/index.js:6113`.
Soru: Kozmetik, yalnızca gelecekteki bir refactor'da kafa karıştırabilir.

**37. [Doğrulandı — Düşük] Ortak · HMAC doğrulaması ikisinde de doğru**
Bulgu: QuickBooks (`intuit-signature`) ve Xero (`x-xero-signature`) webhook imzaları HAM gövde üzerinden, `crypto.timingSafeEqual` ile zamanlama-güvenli karşılaştırılıyor; ham gövde `req.rawBody`'den geliyor (JSON'a çevrilip geri yazılmıyor).
Kanıt: `functions/accounting/quickbooks/webhook.js:27-36`, `functions/accounting/xero/webhook.js:23-32`, `rawBodyOf` `functions/accountingFunctions.js:699-701`.
Soru: Sorun yok — denetim brifinginin bu maddesi kapalı.

**38. [Doğrulandı — Düşük] Ortak · Yetenek kaydı (capability registry) vaat ile davranışı uyumlu**
Bulgu: QuickBooks "For Review" satırlarını hiç iddia etmiyor (`bankFeedPendingRows:{read:false,write:false}`), Xero için ayrı ve doğru nüanslı bir metin var ("mutabık kalınmamış" satırlar değil, "reconciled" satırlar okunabilir), Pandle'ın confirm yeteneği korunuyor — ve web arayüzü hiçbir yerde bu sınırların ötesinde bir "Post" düğmesi sunmuyor.
Kanıt: `functions/accounting/core/adapter.js:109-113,143-147,174-178`; web metni `studioflow-web/app/settings/QuickBooksIntegrationSection.tsx:57,71`; test `functions/test/qa/accounting-core.test.js:23-32`.
Soru: Sorun yok — Q4'ün "UI ne vaat ediyor" kısmı için net, olumlu bir sonuç.

**39. [Doğrulandı — Düşük] Pandle · Sunucu tarafı eşleşme koruması gerçekten "asla client'a güvenme" ilkesiyle çalışıyor**
Bulgu: `pandlePush`, gönderim anında Pandle satırını API'den yeniden okuyor ve yön+kuruşu kuruşuna tutar+tarih sapmasını yeniden doğruluyor (istemcinin gönderdiği eşleşme özetine güvenmiyor); split ve MX işlemler hem önizlemede hem gönderimde ayrı ayrı bloklanıyor; `requestId` ledger'ı + satır-başı `confirmed` kontrolü iki bağımsız katman oluşturuyor.
Kanıt: `functions/pandle.js:724-745` (yeniden okuma+doğrulama), `:311` ve gönderim bloğu (MX), split bloğu, `pandleSyncRuns` mantığı `:654-679`.
Soru: Sorun yok — yalnızca #8'in canlıda hiç denenmemiş olması gölge düşürüyor.

**40. [Düşük] Ortak · Olay sırası riski, "her zaman güncel durumu yeniden çek" deseniyle büyük ölçüde etkisizleştirilmiş**
Bulgu: Webhook işleyicisi, olayın kendi payload'undaki veriye değil, işlenme anında sağlayıcıdan TAZE çekilen duruma göre `accountingIdentities`'i günceller (`adapter.fetchEntity`); bu yüzden olaylar sırasız gelse bile son yazılan anlık görüntü her zaman "en güncel" durumu yansıtır.
Kanıt: `functions/accountingFunctions.js:687-689` (`fetchEntity` + `applyChange`).
Soru: Sorun yok — yalnız #12/#23'teki id-çakışması riskinin neden "kalıcı veri kaybı değil, gecikme" olduğunu açıklıyor.

---

**Genel değerlendirme (bookkeeper + on-call mühendis gözüyle):** Mühendislik kalitesi yüksek — HMAC doğrulaması, idempotency, tek-yazıcı kuralı ve Pandle'ın "asla client'a güvenme" eşleşme koruması gerçekten sağlam ve dürüst yorumlarla belgelenmiş. Ama üç somut, para-bitişik açık var: **Pandle token'ları düz metin** (#5), **PayPal'ın ayrı hesap olarak modellenmemesi** (#7) ve **Pandle'ın uçtan uca hiç canlıda denenmemiş olması** (#8) — bunlar bugün üretime en yakın, en riskli üç madde. QuickBooks/Xero tarafında asıl risk "yanlış defter kaydı" değil, "sessizce eksik senkronizasyon" (webhook hiç gelmemiş olması, #9-#10) ve "anahtar rotasyonunun kimseye söylemeden bağlantıyı öldürmesi" (#3-#4, #6).

---

# 7) CHATGPT UYGULAMASI (MCP) · WEB SİTESİ BOTU · ASİSTAN · AI QUICK REPLIES


### A) Akış Haritası

1. ChatGPT "Connect" der → `chatgptOAuthRegister`'a POST atılır, bir `client_id` üretilir ama **hiçbir yere kaydedilmez** (functions/index.js:23630-23657).
2. ChatGPT kullanıcıyı `chatgptOAuthAuthorize`'a yönlendirir (client_id+redirect_uri+PKCE) → fonksiyon bunları doğrulamadan `nivadesk.app/chatgpt/connect`'e yönlendirir (index.js:23659-23709).
3. Next.js sayfası (`ChatGPTConnectClient.tsx`) query string'i **aynen** okur, Firebase Auth ile giriş yaptırır, `chatgptOAuthWorkspaces`'ten erişilebilir workspace'leri listeler.
4. Kullanıcı workspace seçip "Allow ChatGPT" der → tarayıcı kendi Firebase ID token'ıyla `chatgptOAuthApprove`'a POST atar (redirect_uri hâlâ doğrulanmamış) → bir authorization code üretilip redirect_uri'ye yönlendirilir.
5. Code, `chatgptOAuthToken`'da PKCE ile değişilir → **30 günlük, yenilenemeyen ama iptal de edilemeyen** bir bearer token (uid+companyId+scope damgalı) döner (index.js:23328,23861-23929).
6. ChatGPT bundan sonra `chatgptMcp`'ye JSON-RPC atar (`tools/list` kimliksiz, `tools/call` Bearer'lı); her çağrıda workspace üyeliği YENİDEN kontrol edilir (iyi) ama araç bazında rol/alan kontrolü tutarsız (bkz. Bulgular).
7. Web sitesi ziyaretçisi `createWebsiteChat`'i (kimliksiz, IP başına saatlik limit) çağırır → `visitorToken` localStorage'a yazılır → `postWebsiteChatMessage`/`getWebsiteChatThread` bu token'ı `ticketId` ile eşler.
8. Website bot ve uygulama-içi asistan, **TEK bir workspace'in** (setWebsiteAssistant ile seçilmiş) OpenAI anahtarını paylaşır; "emin değilim" durumunda insan devralır, mail sadece o an gider.
9. `askAppAssistant`: sadece giriş yapmış + ücretli plan; günlük 40 soru sınırı; `guideCorpus.json`'dan (tüm rehber) besleniyor.
10. `getUserGuide`: plan kontrolü + auth kontrolü; rehber kaynağı (`guide.ts`) client bundle'a hiç girmiyor.
11. Quick Reply: müşteri kendi OpenAI anahtarını `saveQuickReplySettings` ile (sadece owner) `quickReplySecrets`'a yazar; `generateQuickReply` bu anahtarla OpenAI'yi çağırır, `testQuickReplyApiKey` anahtarı ayrı test eder.
12. Fotoğraf→envanter (`create_inventory_item`) ve e-posta makbuzu (`attach_bank_receipt`'in `receiptUrl`/`emailReceipt`), `NIVADESK_MCP_INVENTORY`/`NIVADESK_MCP_EMAIL_RECEIPTS` bayraklarıyla `tools/list`'te gizli ama dispatcher'da her zaman canlı.

### B) Bulgular

### ChatGPT / MCP — OAuth

1. **[Kritik]** ChatGPT/MCP · Dynamic Client Registration tamamen kozmetik · `chatgptOAuthRegister` bir `client_id` üretip client'ın verdiği `redirect_uris`'i aynen geri yansıtır ama **Firestore'a hiçbir şey yazmaz** — sonraki hiçbir adımda `client_id` gerçekten "kayıtlı mı" diye kontrol edilmez. · Kanıt: functions/index.js:23630-23657 (handler içinde `.set()`/`.doc()` yok). · Kontrol: Bilerek mi minimal tutuldu, yoksa ileride gerçek bir `chatgptOAuthClients` koleksiyonu mu planlanıyordu?

2. **[Kritik]** ChatGPT/MCP · redirect_uri hiçbir allowlist'e karşı doğrulanmıyor → phishing ile hesap ele geçirme · `nvSafeOAuthUri` sadece "geçerli http(s) URL mi" bakar; `chatgptOAuthApprove` client'ın gönderdiği `redirect_uri`'yi olduğu gibi kullanır. Onay ekranı (`ChatGPTConnectClient.tsx`) kullanıcıya `client_id`/`redirect_uri` hiç göstermez. Saldırgan `nivadesk.app/chatgpt/connect?...&redirect_uri=https://evil.com&code_challenge=<kendi>` linkini kurbana gönderir; kurban giriş yapıp workspace seçip "Allow" der, authorization code `evil.com`'a gider; saldırgan kendi `code_verifier`'ıyla `chatgptOAuthToken`'dan kurbanın workspace'ine bağlı 30 günlük bir bearer token alır. Şifre gerekmez. · Kanıt: index.js:23365-23374 (nvSafeOAuthUri), :23794-23845 (chatgptOAuthApprove), :23861-23929 (chatgptOAuthToken — sadece code kaydıyla iç tutarlılık bakıyor, kayıt zaten doğrulanmamış); studioflow-web/app/chatgpt/connect/ChatGPTConnectClient.tsx:53-62 (query string aynen okunuyor), :193-226 (handleAllow → window.location.assign(data.redirect_uri)), :342-349 (onay metni client_id/redirect_uri göstermiyor). · Kontrol: Bu zinciri gerçek bir OpenAI test client_id'siyle uçtan uca doğrulayın; bulgu 14'teki test boşluğuyla birlikte en yüksek öncelik.

3. **[Kritik]** ChatGPT/MCP · Token iptali (revocation) hiçbir yerde uygulanmamış · `chatgptOAuthTokens.revokedAtMs` sadece oluşturulurken `0` yazılıyor ve okunuyor; repo genelinde bunu `>0` yapan **tek bir yazma noktası yok** (karşılaştırma: `portalLinks`/`estimateLinks` için gerçek iptal akışları var). Tek çıkış yolu 30 günlük doğal süre dolumu. · Kanıt: index.js:23550 (oluşturmada revokedAtMs:0), :23573 (kontrol), :28053 ve :28840 (sadece admin istatistiği için okunuyor, hiç yazılmıyor); grep ile repo genelinde başka yazma noktası bulunamadı. · Kontrol: "Kullanıcı reconnect/remove ile iptal edebilir" yorumu (index.js:23328 civarı) ChatGPT tarafındaki bağlantıyı kaldırmayı kastediyor — bu, çalınmış/istismar edilmiş bir bearer token'ı geçersizleştirmez; bir "Disconnect" callable'ı eklenmeli.

4. **[Kritik]** ChatGPT/MCP · Kullanıcının ChatGPT bağlantısının var olduğunu görecek hiçbir yeri yok · Onboarding sihirbazının kendi kodu bunu itiraf ediyor: "No client-readable signal: the ChatGPT app's token lives in a top-level collection... chatgpt: false". Bulgu 3 ile birleşince: çalınan/istenmeyen bir bağlantı ne görülebilir ne de iptal edilebilir. · Kanıt: studioflow-web/components/AppShell.tsx:1876-1878. · Kontrol: Settings/Integrations'a "ChatGPT — Connected (workspace X, DD/MM)" + Disconnect eklenmeli.

5. **[Yüksek]** ChatGPT/MCP · OAuth scope modeli (orders.read/write, notes.*, finance.read, tasks.write) tamamen dekoratif · `nvMcpOAuthScopesForTool` sadece `tools/list` metadata'sını (ChatGPT'nin onay ekranında gösterdiği) besliyor; token'ın `scope` alanı context'e taşınıyor (`context.scope`) ama **hiçbir handler bunu okumuyor** — dar scope'lu bir token bile her aracı çağırabilir. Ayrıca yazan `create_inventory_item` yanlışlıkla `orders.read` scope'una etiketlenmiş (default case). · Kanıt: index.js:24089-24122 (scope haritası), :23613 (context.scope atanıyor), repo genelinde `context.scope`'un başka hiçbir okunma yeri yok (tek eşleşme index.js:27098, alakasız). · Kontrol: yok — kod doğrulaması yeterli.

6. **[Orta]** ChatGPT/MCP · Çift/çelişen OAuth Authorization Server metadata'sı · `mcp.nivadesk.app`'ın kendi discovery'si (`nvOAuthAuthorizationServerMetadata`, issuer=mcp.nivadesk.app) ile `nivadesk.app`'ın statik Next.js route'ları (issuer=nivadesk.app) aynı authorize/token endpoint'leri için **iki farklı issuer kimliği** ilan ediyor; scope listesi 6+ yerde elle senkron tutulmak zorunda. · Kanıt: index.js:23411-23434 vs studioflow-web/app/.well-known/oauth-authorization-server/route.ts:20-21 ve openid-configuration/route.ts:20-21; scope tekrarları index.js:23393-23400,23421-23429, lib/chatgpt/proxyFirebaseFunction.ts:79. · Kontrol: Hangisi OpenAI'nin gerçekten güvendiği discovery mi, ikisi de mi taranıyor?

7. **[Orta]** ChatGPT/MCP · `chatgptWorkspaceAction` kullanılmayan ama canlı bir endpoint · grep ile studioflow-web/EGGcraft/Android'de sıfır çağrı bulundu; yine de `chatgptMcp` ile aynı dispatch mantığını (dolayısıyla bulgu 9/10'daki aynı boşlukları) paylaşan, sadece Firebase ID token isteyen, halka açık bir Cloud Function olarak deploy'da duruyor. · Kanıt: index.js:24963-24991; grep -rn "chatgptWorkspaceAction" sadece index.js'in kendisinde. · Kontrol: Kaldırılmalı mı, yoksa gelecekte native app'ler mi kullanacak?

8. **[Düşük]** ChatGPT/MCP · `tools/list` kimliksiz herkese açık (tasarım gereği) · GET ve POST `tools/list`/`initialize` hiçbir auth istemiyor — tüm araç adları, açıklamaları, iç yorumlardan türeyen ipuçları ("Workspace owner only" vb.) token'sız görülebiliyor. MCP keşif protokolü için normal ama bulgu 2'deki phishing'i çok daha inandırıcı kılan bir bilgi kaynağı. · Kanıt: index.js:24902-24931, :24864-24873.

### ChatGPT / MCP — Araç yüzeyi ve yetkilendirme

9. **[Kritik]** ChatGPT/MCP · Finansal alanlar rol/plan kontrolünden bağımsız sızıyor · `nvSafeOrderForChatGPT` (search_orders, get_order_detail, create_order'ın döndürdüğü) `paidAmount`/`remainingAmount`/`watchPurchasePrice`'ı **koşulsuz** döndürüyor — `nvRequireFinancialAccess` çağrısı yok. Oysa aynı dosyada `get_order_financials`/`get_dashboard_summary`/`get_financial_overview`/`get_extra_spending_overview` bu kontrolü doğru uyguluyor. Finansal erişimi owner tarafından kapatılmış bir üye, sıradan bir sipariş aramasıyla tüm siparişlerin ödenen/kalan/maliyet tutarlarını ChatGPT üzerinden görebilir. · Kanıt: index.js:21572-21601 (alan listesi, finansal alanlar ~21594-21596), kullanım :22436,22475,22419; karşılaştırma :21839 (nvRequireFinancialAccess çağrısı var) vs bu üç fonksiyonda yok.

10. **[Yüksek]** ChatGPT/MCP · Sipariş araçları workspace'in "Orders" alan iznini (memberAccess) atlıyor · `search_orders`/`get_order_detail`/`add_order_note`/`update_order_status`/`create_order` hiçbiri `uidCanAccessWorkspaceArea(...,"orders")` kontrolü yapmıyor — sadece genel rol (`nvRoleCanWriteOrders`, owner/admin/member/workflowOnly hepsi true) bakılıyor. Uygulamanın kendisi aynı iznı sipariş silme/tam düzenlemede zorunlu tutuyor. Owner bir üyenin "Orders" erişimini kapatsa bile o üye ChatGPT üzerinden siparişleri okuyup yazabilir. · Kanıt: index.js:22423-22462, :22464-22476, :22478-22507, :22509-22546, :22411-22420 (kontrol yok) vs :11670,14836,14890,14924,15350 (uygulama tarafında zorunlu); erişim modeli firestore-çekirdek index.js:2618-2628.

11. **[Yüksek]** ChatGPT/MCP · İnceleme bayrağı sadece `tools/list`'i gizliyor, aracı değil · `NIVADESK_MCP_INVENTORY=0` iken `search_inventory`/`create_inventory_item` şemadan kaldırılıyor (index.js:24736) ama `nvChatGPTDispatchAction`'daki case'ler **koşulsuz** duruyor (index.js:22772-22775) — geçerli bir bearer token'ı olan herkes aracı adıyla doğrudan çağırabilir. Aynı desen `NIVADESK_MCP_EMAIL_RECEIPTS` için de geçerli: `attach_bank_receipt` handler'ı `args.receiptUrl`/`args.emailReceipt`'i bayraktan bağımsız okuyor (index.js:23172-23212); sadece şema alanları bayraklı (index.js:24711). "OpenAI incelemesi bitene kadar tools/list sabit" hedefi teknik olarak tutuluyor (docs/DURUM.md:1769-1771, mcp-inventory.test.js ile doğrulanmış) ama **fiili yetenek** zaten canlı — incelemenin görmediği bir yüzey kullanılabilir durumda. · Kanıt: yukarıdaki satırlar + docs/DURUM.md:1763-1793. · Kontrol: `attach_bank_receipt` zaten owner-only olduğu için etkisi sınırlı; `create_inventory_item` ise "orders" alanına erişimi olan her rol için açık.

12. **[Orta]** ChatGPT/MCP · SSRF koruması tutarsız uygulanmış — dokümantasyonun iddia ettiğinden zayıf · `nvAssertPublicHttpsUrl` (localhost/private IP/link-local engeli) `receiptUrl`'e uygulanıyor ama `receipt.download_url` (attach_bank_receipt) ve `photo.download_url` (create_inventory_item) sadece `https://` ile mi başlıyor diye bakılıp **korumasız** kullanılıyor. docs/DURUM.md "SSRF-korumalı indirilip" diyor ama asıl (birincil) yol korumasız. · Kanıt: index.js:23176 (chatFileUrl bypass), :22898 (photoUrl bypass), :23116-23131 (guard'ın kendisi); docs/DURUM.md:1774. · Kontrol: Bu alanlar normalde ChatGPT'nin kendi dosya sunucusundan gelir ama model çıktısı olarak (prompt injection ile) saldırgan URL'i de taşıyabilir — bkz. bulgu 13.

13. **[Orta]** ChatGPT/MCP · Fotoğraf→envanter onayı yalnızca prompt seviyesinde · `create_inventory_item`'ın `confirmed:true` kapısı, modelin gerçekten kullanıcıya önizleme gösterdiğini sunucu tarafında ispatlamıyor — sadece bir boolean bayrak. Manipüle edilmiş/jailbreak'lenmiş bir model turu (ör. okuduğu bir notta/webde gizli talimat) `confirmed:true`'yu doğrudan geçebilir. · Kanıt: index.js:22853-22858. · Kontrol: Q3'ün "model çıktısı talimat olarak güveniliyor mu" sorusuna en somut örnek — bu ve bulgu 12, MCP'deki tek gerçek prompt-injection yüzeyi (website/in-app asistanlar salt metin döndürüyor, araç tetiklemiyor).

14. **[Kritik]** ChatGPT/MCP · Test kapsamı sıfır — 9 endpoint'in hiçbiri test edilmiyor · `grep -rln "chatgptOAuth\|chatgptMcp\|chatgptWorkspaceAction" functions/test/` **hiçbir sonuç vermiyor**. PKCE uyuşmazlığı, tekrar kullanılan/süresi dolmuş code, redirect_uri uyuşmazlığı, cross-tenant erişim, araç bazlı yetkilendirme — hiçbiri test edilmemiş. Karşılaştırma: Etsy OAuth callback'i (`etsy-connect.test.js`) tam bu sınıfta örnek kalitede negatif-yol testlerine sahip (state TTL, geçersiz state, kullanıcı reddi, code replay, token exchange hatası) — ekip deseni biliyor, ChatGPT'ye uygulamamış. `mcp-inventory.test.js` sadece bayrak-şema davranışını ve bir regex sezgiselini test ediyor, `chatgptMcp`'yi hiç çağırmıyor. · Kanıt: functions/test/qa/mcp-inventory.test.js (tüm dosya); functions/test/qa/etsy-connect.test.js:205-238,305; repo genelinde OAuth/MCP anahtar kelimeleriyle sıfır eşleşme. · Bu test, bulgu 2'yi yakalayabilecek tam da testtir.

### Website chat

15. **[Orta]** Website chat · Public callable'larda App Check yok, IP-limit script ile kolayca aşılır · `createWebsiteChat`/`postWebsiteChatMessage` kimliksiz çalışıyor; tek savunma saatte 5 yeni thread + 40 mesaj (IP hash başına). Platform genelinde `enforceAppCheck`/`AppCheck` hiç kullanılmıyor (grep sıfır sonuç) — bir script IP rotasyonuyla limiti trivial şekilde aşabilir. · Kanıt: index.js:3546-3549,4518-4521,4645-4647; repo genelinde "AppCheck" araması sıfır sonuç.

16. **[Yüksek]** Website chat + Asistan · Hem public site botu hem uygulama-içi asistan TEK bir workspace'in OpenAI anahtarını paylaşıyor · `websiteAssistantKey()`, `setWebsiteAssistant`'ın `companyId`'siyle seçilen workspace'in `quickReplySecrets` anahtarını okuyor; bu anahtar hem `askAppAssistant` (tüm ücretli müşteriler) hem `postWebsiteChatMessage` (tüm anonim ziyaretçiler) için kullanılıyor. Tek workspace'in OpenAI faturası/kotası tüm platformu taşıyor; sahibi anahtarı değiştirir/silerse iki özellik de birden kararır. · Kanıt: index.js:3864-3876, :4472-4477, :4323-4326, :3947.

17. **[Orta]** Website chat · Anahtar eksik/yanlış yapılandırıldığında sessiz kalıyor (tam önlenmek istenen hata tekrar ediyor) · `websiteAssistantReply`, OpenAI API hatasında düzgün "bir kişiye bağlayayım" mesajı yazıp `lastProviderError`'ı kaydediyor (iyi) — ama anahtar tamamen yoksa/yanlış companyId'ye işaret ediyorsa sessizce `null` dönüyor, **hiçbir cevap yazılmıyor ve hata kaydedilmiyor**. Kodun kendi yorumu "provider outage used to end as silence... say something instead" derken bu yolu kapsamıyor. · Kanıt: index.js:3947-3951 (sessiz çıkış) vs :3985-3988,4015-4019 (API hatasında düzgün fallback); yorum :3878-3881.

18. **[Orta]** Website chat · Ziyaretçi kimliği Firebase Auth'a değil sadece token'a bağlı; logout'ta temizlenmiyor · `websiteChatTicketForVisitor` sadece `visitorToken`'ı (192-bit, iyi) kontrol ediyor — giriş yapmış bir kullanıcının thread'i bile o anki `request.auth.uid` ile karşılaştırılmıyor. `writeWebsiteChatSession(null)` sadece thread 404 verince çağrılıyor, çıkış yapılınca değil. Paylaşımlı bir cihazda sonraki kişi, önceki giriş yapmış kullanıcının chat geçmişini (ve varsa bıraktığı e-postayı) okumaya devam edebilir. · Kanıt: index.js:3589-3605, :4538-4569; studioflow-web/lib/publicSite/websiteChat.ts:33-54; studioflow-web/components/SupportChatWidget.tsx:57 (tek `writeWebsiteChatSession(null)` çağrısı). · Kontrol: "Card cache device-local bleed" ile aynı sınıf bir sızıntı — o zaten fark edilip düzeltilmişti, bu anahtar o taramaya dahil edilmemiş görünüyor.

19. **[Düşük]** Website chat · `getWebsiteChatThread`'de saatlik limit yok · `postWebsiteChatMessage`/`websiteChatRequestHuman` 40/saat sınırlıyken bu yol sınırsız — token entropisi yüksek olduğu için risk düşük, ama tutarsız. · Kanıt: index.js:4759-4799 (websiteChatCheckRate çağrısı yok).

20. **[Bilgi]** Website chat · AI/insan ayrımı görsel olarak net (Q6'nın istediği) · Farklı avatar/etiket, "Handed to NivaDesk team" ayırıcı, `assistantConfident` bayrağı devretme CTA'sını tetikliyor, e-posta sadece insan gerektiğinde gidiyor — "NivaDesk_chatbot 2.md" tasarım notuyla birebir örtüşüyor. Sorun değil, doğrulanmış iyi kontrol. · Kanıt: studioflow-web/components/SupportChatWidget.tsx:198-280; index.js:4685-4699.

21. **[verify]** Website chat · `supportTickets` için görünür bir saklama/otomatik silme işi bulunamadı · Zaman kısıtı nedeniyle zamanlanmış bir purge fonksiyonu doğrulanamadı; GDPR açısından ziyaretçi transkriptlerinin (e-posta/şirket/plan içerebilir) ne kadar süre tutulduğu netleştirilmeli.

### Quick Reply — müşterinin OpenAI anahtarı

22. **[Yüksek]** Quick Reply · Müşterinin OpenAI anahtarı uygulama katmanında şifrelenmemiş · `secureQuickReplyOpenAIKey`/`quickReplySecretDocRef` anahtarı düz metin olarak `quickReplySecrets.openAIKey`'e yazıyor — alan-seviyesi şifreleme (KMS/envelope) yok, sadece Firestore'un varsayılan disk-seviyesi şifrelemesine güveniliyor. Koleksiyonun kendisi doğru kilitli (`allow read, write: if false`). · Kanıt: index.js:7778-7802,7711-7713 (encrypt/decrypt çağrısı yok); firestore.rules:1062-1064.

23. **[Yüksek]** Quick Reply · Eski/geçiş dönemi `companySettings.openAIKey` alanı, workspace'in birçok rolüne açık bir dokümanda kalabiliyor · Anahtar migrasyonu (`companySettings`'ten `quickReplySecrets`'a) sadece `testQuickReplyApiKey`/`generateQuickReply`/`saveQuickReplySettings` çağrıldığında **tembel** olarak çalışıyor. `companySettings/{companyId}` ise `canReadCompany` ile owner/admin/member/viewer/workflow rollerinin **hepsine** okumaya açık (alan-seviyesi kısıtlama Firestore Rules'ta mümkün değil). Bu migrasyondan önce anahtarını girmiş ve o zamandan beri Quick Reply'e dokunmamış bir workspace'te, sıradan bir üye owner'ın ham OpenAI anahtarını düz bir Firestore `getDoc` ile okuyabilir. · Kanıt: firestore.rules:1010-1011,35-41 (rol listesi); index.js:8043 (proaktif silme sadece saveQuickReplySettings'te), :7784-7801 (tembel migrasyon). · Kontrol: Üretimde hâlâ `companySettings.openAIKey` dolu olan workspace var mı diye sorgulanmalı.

24. **[Orta]** Quick Reply · `testQuickReplyApiKey` hata mesajı kota/faturalama hatalarında yanıltıcı · 401 dışındaki her durumda "OpenAI answered {status}. Try again in a moment." — 429 (kota aşımı/faturalama) da dahil, kullanıcıyı "az sonra tekrar dene"ye yönlendiriyor; oysa gerçek çözüm OpenAI hesabına ödeme eklemek. `generateQuickReply` aynı sınıf hatada OpenAI'nin gerçek mesajını doğrudan gösteriyor — iki uç arasında tutarsız ve daha az bilgilendirici olan tam da test butonu. · Kanıt: index.js:7958-7965 vs :8380-8384.

25. **[Orta]** Quick Reply · `key-test.mjs` başarı yolunu ve kota hatasını hiç test etmiyor, CI'da otomatik çalışmıyor · Dosya adı `.test.js`/`.test.mjs` kalıbına uymadığı için `npm test` ve `npm run test:rules`'a girmiyor; sadece emülatör + gerçek OpenAI ağ çağrısı gerektiren `test:integration`'da (ve `test:ci`'nin dışında) çalışıyor. Çalışan anahtar senaryosu ve 429 dalı hiç test edilmemiş; endpoint'in rol kontrolü sadece owner ile test edilmiş, düşük yetkili üyeyle hiç değil. · Kanıt: functions/test/qa/key-test.mjs; functions/package.json scripts; functions/test/qa/README.md:28.

26. **[Orta]** Quick Reply · `generateQuickReply`'de hız sınırı yok — owner'ın faturası, "member" rolündeki biri tarafından tüketilebilir · Varsayılan olarak `quickReply` alanı her role açık (`WORKSPACE_MEMBER_ACCESS_DEFAULTS.quickReply=true`); çağrı owner'ın kayıtlı anahtarını kullanıyor ama çağıran kişi owner olmak zorunda değil, ve `websiteChatCheckRate`/`appAssistantDailyGuard`'a benzer bir sınır burada yok. · Kanıt: index.js:8324-8397 (sınır çağrısı yok); erişim varsayılanı ~index.js:2483.

### Uygulama-içi asistan / Rehber (guide)

27. **[Orta]** Asistan · İki bağımsız retrieval algoritması, biri düzeltilmiş diğeri düzeltilmemiş · `appAssistantRelevantSections` (in-app) ile `websiteAssistantGuideBlock` (website) farklı puanlama kullanıyor (düz alt-dize eşleşmesi vs 5-harf gövde eşleşmesi). Daha önemlisi: in-app tarafın "hiçbir bölüm eşleşmedi" fallback'i **bilinçli olarak** ilgiye göre sıralanacak şekilde yeniden yazılmış (kodun kendi yorumu: yeni yayınlanan bir özellik dokümanda son sırada olduğu için görünmez kalıyormuş, düzeltme buymuş) — ama website tarafının aynı fallback'i **hâlâ döküman sırasıyla** dolduruyor, yani aynı "yeni özellik görünmez" hatasını tekrar edebiliyor. İçerik kaynağı ortak (sorun değil), retrieval mantığı değil. · Kanıt: index.js:4179-4241 (in-app, açıklayıcı yorum :4225-4230) vs :3773-3834 (website, döküman-sırası döngü :3814-3822).

28. **[Bilgi]** Asistan · Rehber tazeliği gerçek bir tam-içerik diff'iyle korunuyor ama deploy'u zorlamıyor · `guide-corpus-fresh.test.js`, `buildGuideCorpus.js`'i yeniden çalıştırıp checked-in JSON'larla **byte-byte** karşılaştırıyor (sadece varlık/hash değil) — iyi bir kontrol. `npm test`'e dahil ve `.github/workflows/functions-tests.yml` her push/PR'da çalıştırıyor. Ama bu workflow'da deploy adımı yok; bu repoda deploy'lar fonksiyon adıyla elle yapılıyor — testleri atlayıp doğrudan `firebase deploy --only functions:askAppAssistant` çalıştırmayı teknik olarak hiçbir şey engellemiyor. · Kanıt: functions/assistant/buildGuideCorpus.js:1-14; functions/test/qa/guide-corpus-fresh.test.js:18-29; .github/workflows/functions-tests.yml (deploy adımı yok).

29. **[Bilgi]** Asistan · `askAppAssistant` günlük 40 soru/uid sınırı ve auth+plan kontrolü sağlam — maliyet riski website chat'e (bulgu 15-16) göre düşük. · Kanıt: index.js:4289-4301.

30. **[Bilgi]** Rehber kilidi (Q8) sağlam doğrulandı · `guide.ts` hiçbir client bundle'a import edilmiyor (repo genelinde arama sıfır sonuç); `/guide` içeriği yalnızca `getUserGuide` callable'ından, hem client-side auth kontrolünden hem sunucu-side plan kontrolünden geçerek geliyor; `robots.ts` `/guide`'ı hem genel crawler'lara hem açıkça davet edilen AI crawler'lara (GPTBot, ClaudeBot vb.) kapatıyor. · Kanıt: studioflow-web/components/PublicMarketing.tsx:4320-4339; index.js:4432-4456; studioflow-web/app/robots.ts:33,38-56,58-71.

### Native/Web parite ve son bulgular

31. **[Orta]** Quick Reply · Android'de sadece "cevap üret" var; anahtar testi, şirket ayarları, katkı yönetimi yok · `QuickReplyScreen.kt` yalnızca `generateQuickReply` callable'ını çağırıyor; `testQuickReplyApiKey`, `saveQuickReplySettings` (OpenAI anahtarının kendisi dahil), kişisel ayarlar, bilgi tabanı katkıları için hiçbir UI yok — şirket çapında kurulum web'de yapılmak zorunda. · Kanıt: studioflow-android/app/src/main/java/uk/co/eggcraft/studioflow/features/quickreply/QuickReplyScreen.kt (repo grep'inde tek callable eşleşmesi).

32. **[Düşük]** Quick Reply · macOS/iOS bir kademe daha iyi ama yine de anahtar testi/şirket ayarları/katkı yönetimi yok · `AutoReplyView.swift` `generateQuickReply` + `getQuickReplyPersonalSettings`/`saveQuickReplyPersonalSettings` çağırıyor; `testQuickReplyApiKey`, `saveQuickReplySettings`, 3 katkı callable'ı hiç çağrılmıyor. · Kanıt: EGGcraft/AutoReplyView.swift:684,719,1056 (bulunan tek 3 callable).

33. **[Bilgi]** Quick Reply · macOS/iOS web'i aşan iki ekstra mod sunuyor: Apple On-Device Intelligence ve kullanıcının kendi ayarladığı yerel Ollama sunucusu (istemciden doğrudan, sunucuya hiç uğramadan). Sunucu "Apple" modunu bilerek reddedip Swift app'e yönlendiriyor. Sorun değil, paritenin diğer yönde de çalıştığını gösteriyor. · Kanıt: index.js:8349-8351; EGGcraft/AutoReplyView.swift:48,957-1035.

34. **[Bilgi]** Asistan · Uygulama-içi yardım asistanı 4 platformda (Web/Mac/iOS/Android) tutarlı platform etiketleri ile gerçek parite gösteriyor. · Kanıt: functions/test/qa/guide-platform-tags.test.js:49-57 (index.js, appAssistant.ts, AppHelpAssistantView.swift, Android repository çapraz kontrolü).

35. **[Orta]** ChatGPT/MCP · Hiçbir platformda ChatGPT bağlantısını görme/kesme arayüzü yok · Bulgu 4'ün doğal uzantısı — akış zaten sadece web'de (OAuth tarayıcı akışı) olduğu için native app'lerde de karşılığı yok; ama web'de de yok, yani hiçbir yerde yok. · Kanıt: studioflow-web/components/AppShell.tsx:1876-1878; repo genelinde disconnect/status UI bulunamadı.

36. **[Kritik — özet]** ChatGPT/MCP · Bulgu 2+3+4'ün toplam etkisi · Bir saldırgan (2) ile bir workspace'e sızabilir, (3) token süresiz denecek şekilde (30 gün) iptal edilemez, (4) kurban bunun farkına bile varamaz çünkü uygulama hiçbir yerde "ChatGPT bağlı" demiyor. Bu üçü tek başına da ciddi, birlikte tam bir "sessiz, kalıcı, görünmez arka kapı" senaryosu oluşturuyor. · Kanıt: yukarıdaki 3 bulgunun kanıtları.

---

**Genel değerlendirme:** İş mantığı tarafı (rol/plan kontrolleri — finans, banka, envanter erişimi çoğunlukla; SSRF engeli kısmen; Firestore rules hijyeni) genel olarak özenli ve test edilmiş görünüyor. Asıl zayıf halka **ChatGPT/MCP OAuth katmanı** — kod "MVP/skeleton" yorumlarıyla işaretlenmiş durumda (`// MARK: - ChatGPT OAuth skeleton`, index.js:23324) ve gerçekten de bir iskelet: PKCE var ama gerçek DCR/redirect_uri doğrulaması, revocation ve kullanıcı görünürlüğü yok. Bu üçü, sistemin geri kalanının gösterdiği özenle aynı seviyeye getirilmeden "her plana açık" (chatgpt_app) olarak kalması, en yüksek öncelikli düzeltme alanı.

---

# 8) SMS · E-POSTA · ÖZEL ALAN ADI · KARGO TAKİBİ · FATURALAMA RAYLARI · HUB TUTARLILIĞI


### A) Kaynak/Durum Matrisi

**Entegrasyon kataloğu** (`studioflow-web/lib/studioflow/integrations.ts` × `EGGcraft/NivaDeskIntegrations.swift` × `studioflow-android/.../IntegrationsHub.kt`):

| Connector | Web | Mac/iOS | Android | Gerçek durum |
|---|---|---|---|---|
| Shopify | native | native | native | Uyumlu |
| WooCommerce | native | native | native | Uyumlu |
| Square | native | native | native | Uyumlu |
| Etsy | native | native | native | Uyumlu |
| Wix / Squarespace | webhook | webhook | webhook | Uyumlu, ama tek ortak "inbound" kanalını paylaşıyorlar (bkz. Bulgu 37) |
| Amazon / Google Drive / Dropbox / Stripe(bağlayıcı) | planned | planned | planned | Uyumlu, gerçekten yok |
| Open Banking | native | native | native | Uyumlu |
| Pandle | planned | planned | planned | Uyumlu, gerçekten yok |
| **QuickBooks Online** | **native, CANLI** | **planned ("Coming soon")** | **planned ("Coming soon")** | **UYUMSUZ — bkz. Bulgu 34** |
| **Xero** | **native, CANLI** | **planned** | **planned** | **UYUMSUZ — bkz. Bulgu 34** |
| Zapier / Make | webhook | webhook | webhook | Uyumlu |
| PayPal | native | native | native | Uyumlu |

**Kataloğa girmeyen dört alan** (platform kapsayışı):

| Alan | Web | Mac/iOS | Android | Not |
|---|---|---|---|---|
| SMS (Twilio) | ayar ekranı var | ayar ekranı var | ayar ekranı var | Gönderim tek sunucu motorundan; `sendingLive` her yerde aynı gerçeği okuyor |
| Özel domain/portal | tam yönetim ekranı | yok | yok | Native'de domain bağlama arayüzü yok, sadece web'den yönetilebiliyor |
| 17TRACK kargo takip | ortak backend | ortak backend | ortak backend | Tek motor, platformlar arası fark yok |
| Faturalama | Stripe | Apple IAP | Google Play | Her ray kendi platformunda; çapraz-ray reddi sunucuda (Bulgu 31) |

---

### B) Bulgular

**SMS / E-posta**

1. [Orta] SMS · STOP/opt-out mekanizması yok · Müşterinin kendi kendine SMS'ten çıkma yolu yok, sadece işletme ayarı kapatabilir · Kanıt: functions/index.js:25228-25318 (twilioMessagingProvider — sadece delivery-status webhook'u var, inbound/STOP işleyen ayrı webhook yok) · Kontrol: Twilio hesabında/Messaging Service'te "Advanced Opt-Out" otomatik mi devrede?

2. [Yüksek] SMS · Harcama tavanı/kota kontrolü yok · Bir workspace'in durum döngüsü (ya da art niyetli kullanım) NivaDesk'in Twilio hesabından sınırsız maliyet açabilir · Kanıt: functions/index.js:25356 (addSmsUsage sadece biriktiriyor) — sendWorkspaceSMS (25439) bu sayaçlara karşı hiçbir "aştıysa gönderme" kontrolü yapmıyor · Kontrol: Twilio hesap düzeyinde harcama alarmı var mı?

3. [Orta] SMS · Gönderim hataları hiçbir arayüzde görünmüyor · İşletme, "hazır" mesajının müşteriye ulaşmadığını hiç öğrenemez · Kanıt: functions/index.js:25323-25330 (messageLog sadece yazılıyor); repo genelinde (web/EGGcraft/Android) messageLog'u okuyan tek satır yok — doğrulandı.

4. [Orta] SMS · Ülke kodu varsayımı workspace-genelinde tek değer · 0 ile başlayan numara her zaman workspace'in `smsDefaultCallingCode`'una (varsayılan 44/UK) göre çevriliyor, sipariş bazında geçersiz kılma yok · Kanıt: functions/index.js:25219-25226 (cleanE164Phone) · Kontrol: Uluslararası müşterisi olan atölyeler bu riski biliyor mu?

5. [Düşük]/verify SMS · Desteklenmeyen ülke/Twilio geo-permission hatası ayrı ele alınmıyor, generic "provider_error" olarak yutuluyor · Kanıt: functions/index.js:25439-25477 · Kontrol: Twilio hesabında hangi ülkeler açık?

6. [Orta] SMS/E-posta · Rıza belgelemesi yok, sadece kod yorumunda "transactional, marketing değil" savunması var · Sipariş oluşturulurken müşterinin SMS'e ayrı rıza verdiğine dair kayıt yok · Kanıt: functions/index.js:26170 civarı yorum · Kontrol: Bu değerlendirme UK PECR açısından hukuken gözden geçirildi mi?

7. [Düşük] SMS · Twilio sender onay durumu (`NIVADESK_SMS_SENDER_STATUS`) elle güncellenen bir env değişkeni · Twilio gerçekten onaylasa bile flip unutulursa SMS süresiz "pending" kalır · Kanıt: functions/index.js:25404-25417.

8. [Orta]/verify SMS/E-posta · notifyCustomerOnStatusChange'de retry/idempotency koruması yok · `portalLastNotifiedStatus` ancak SMS+e-posta gönderildikten SONRA, en sonda güncelleniyor; nadir bir Eventarc yeniden-teslimatı aynı durum değişikliği için çift gönderime yol açabilir · Kanıt: functions/index.js:26081-26220 (özellikle akışın sonu) · Kontrol: Fonksiyon tanımında retry gerçekten kapalı mı?

9. [Bilgi] SMS/E-posta · Emülatör gerçek mail/SMS göndermiyor — doğrulandı · `nvMailTransport` (index.js:43) ve `nvOutboundBlocked` (index.js:37) FIRESTORE_EMULATOR_HOST'a göre TÜM nodemailer.createTransport (5 kullanım) ve Twilio sendSMS çağrısını kapatıyor; bunların dışında çıplak nodemailer çağrısı yok.

**Özel Domain / Portal Linkleri**

10. [Kritik]/verify Domain · Cloudflare API token placeholder ise özel domainlerde TLS asla kurulmuyor ama arayüz yanıltıcı bir "birkaç dakikaya kadar" mesajı gösteriyor · Kanıt: functions/clientDomains.js:46-51 (`value.toLowerCase() === "placeholder"` kontrolü — kod, bu string'in canlıda kullanıldığını ima ediyor), verifyClientDomain (clientDomains.js:273) token yoksa cert bloğunu hiç çalıştırmıyor, studioflow-web/app/settings/ClientDomainSection.tsx:267 ("being issued — usually a few minutes") · Kontrol: NIVADESK_CF_API_TOKEN şu an gerçek bir değer mi yoksa hâlâ placeholder mı (isim/durum sorusu, değer istenmedi)?

11. [Yüksek] Domain · Portaldaki fotoğraf linkleri "Revoke" sonrası da ölmüyor · Portal fotoğrafları hâlâ eski `/f/...?b=...&t=...` biçiminde, Storage indirme token'ı URL'nin içinde açık · Kanıt: functions/index.js:25801 (maskedPortalFileUrl) — oysa token'ı sunucuda saklayan short-link mekanizması (nvCreateFileLink, index.js:25071) zaten var ve burada kullanılmıyor · Kullanıcı sorunu: Müşteri görsel linkini kopyalarsa, portal token'ı iptal edilse bile o linke erişim (Storage token'ı ayrıca rotate edilmedikçe) süresiz açık kalır.

12. [Yüksek] Domain · Dosya paylaşım linkleri (nvCreateFileLink) hiç iptal edilemiyor · portalLinks'in aksine `fileShares` için revoke/expire yok · Kanıt: functions/index.js:25071-25092 (sadece create var, repo genelinde revoke callable bulunamadı).

13. [Orta] Domain · nvCreateFileLink workspace/sahiplik kontrolü yapmıyor, sadece "oturum açık mı" bakıyor · Kanıt: functions/index.js:25071-25074 · Kontrol: Token zaten elde varsa ek risk teşkil ediyor mu?

14. [Orta] Domain · `assertHostMayServeCompany`, istemcinin kendi beyan ettiği host'a güveniyor — gerçek TLS/Host header değil `request.data.host` (window.location.host) kullanılıyor · Kanıt: functions/index.js:26042-26056; studioflow-web/app/track/[token]/CustomerPortalContent.tsx:62 · Asıl gizlilik sınırı 192-bit token olduğu için pratik istismar düşük, ama "workspace A'nın domaini B'nin verisini sunmasın" iddiası sadece dürüst istemciler için geçerli.

15. [Orta]/verify Domain · Alt alan adı (*.nivadesk.app) için wildcard DNS'in bugün gerçekten kurulu olup olmadığı kod içinde belirsiz bırakılmış · Kanıt: functions/clientDomains.js:11-14 yorum ("DNS... set up outside the codebase; nothing here breaks while that is still pending").

16. [Orta] Domain · Dosya kısa-linki (nvCreateFileLink) rastgele değil, dosya YOLUNUN sha256'sının ilk 12 karakteri — tahmin edilebilir path'lerde çakışma riski · Kanıt: functions/index.js:25071-25080; karşılaştır: gerçek rastgele portal token'ı functions/index.js:25940 (`nvRandomToken(24)`).

17. [Bilgi] Domain · Token iptali doğru tasarlanmış: yeni link basıldığında öncekini otomatik geçersiz kılıyor, revoke ayrıca `revokedAtMs` yazıyor · Kanıt: functions/index.js:25932-26016.

**17TRACK Kargo Takip**

18. [Orta] Tracking · track17Webhook, TRACK17_WEBHOOK_TOKEN ayarlı DEĞİLSE tamamen kimliksiz isteği kabul ediyor (fail-open tasarım) · Kanıt: functions/index.js:20089-20101 · Bugün functions/.env içinde bu anahtarın ADI mevcut (değer okunmadı), yani muhtemelen korunuyor — ama tasarım, smsDeliveryWebhook'un (imzasız isteği HER ZAMAN reddeder) tam tersi bir duruş · Kontrol: Bu değer production'a gerçekten deploy edilmiş mi?

19. [Yüksek] Tracking · registerTracking, global `trackingLookup` kaydını sahiplik kontrolü olmadan üzerine yazıyor · Kanıt: functions/index.js:17775 (`lookupDocRef(trackingNumber).set(...)`, önceki sahibe karşı kontrol yok) · Kullanıcı sorunu: Aynı takip numarasını bilen/tahmin eden başka bir workspace mapping'i kendine çevirirse, gerçek sahibin siparişi bir daha otomatik güncellenmez ve saldırgan kurbanın sevkiyat konum/durumunu kendi siparişinde görebilir.

20. [Yüksek] Tracking · scheduledTrackingRefresh sabit `.limit(80)`, sıralama/cursor yok · Platform genelinde aktif 17TRACK siparişi 80'i geçerse, sorgunun üstü kapalı doc-id sıralaması yüzünden hep AYNI ilk 80 kayıt kontrol edilir, gerisi hiç otomatik yenilenmez · Kanıt: functions/index.js:17845-17854.

21. [Orta] Tracking · Aynı pencere teslim edilmiş siparişleri de yutuyor — filtre `.limit(80)`'den SONRA bellekte uygulanıyor · Kanıt: functions/index.js:17852-17869 (`if (statusText.includes("delivered")) continue;` sorgudan sonra) · Zamanla eski teslim kayıtları pencerenin bir kısmını boşuna işgal edebilir.

22. [Bilgi] Tracking · Hatırlanan collection-group indeks eksikliği artık doğru tanımlı · firestore.indexes.json:42-56, `trackingResults/provider` için hem COLLECTION hem COLLECTION_GROUP kapsamlı ASCENDING override mevcut — talimat gereği deploy edilmedi, sadece dosyadan doğrulandı.

23. [Orta] Tracking · Kurye kapsamı statik eşleme tablolarına bağlı, yeni/az bilinen kurye "Carrier Required"/"Limited Support" olarak kalıyor · Kanıt: functions/index.js ~17660-17720 (carrier_required_message/registered_waiting dalları).

24. [Düşük] Tracking · Müşteri portalı (portalPublicView) 17TRACK'in ayrıntılı durumunu hiç taşımıyor, sadece işlem aşamalarını gösteriyor · Kanıt: functions/index.js:25801 civarı portalPublicView tanımında tracking alanı yok.

**Faturalama Rayları**

25. [Bilgi] Faturalama · Stripe webhook idempotency ve sıralaması sağlam: `stripeBillingEvents/{event.id}` tekrarı engelliyor, `eventSequence` geç gelen eski olayı reddediyor (geçmişte yaşanmış `canceled_at` monotonik-olmama bug'ı yorumda belgelenmiş) · Kanıt: functions/stripeBilling.js:1201-1204, 557-593.

26. [Yüksek] Faturalama · Apple bildirimleri için Stripe'takine denk bir sıralama koruması YOK · `persistApplePlanSubscription`, gelen transaction'ı doğrudan yazıyor; `existing` sadece `createdAt` için okunuyor · Kanıt: functions/stripeBilling.js:643-690 · Kullanıcı sorunu: Apple'ın kendi belgelediği sırasız/tekrarlı bildirim teslimatında, geç gelen eski bir "DID_RENEW" tekrarı aradan geçmiş bir REVOKE/EXPIRE'ı ezip iptal edilmiş bir aboneliği yanlışlıkla aktif gösterebilir · Kontrol: Prod loglarında böyle bir sıra karışıklığı görüldü mü?

27. [Orta]/doğrulandı Faturalama · googlePlayRtdnNotification'da Pub/Sub OIDC/Authorization doğrulaması yok, ANCAK bu doğrudan yetki sahteciliğine yol açmıyor · `fetchGooglePlaySubscription` her zaman Google'ın gerçek androidpublisher API'sine sorgu atıyor, sahte purchaseToken orada hata verir · Kanıt: functions/stripeBilling.js:2075-2107 (auth kontrolü yok), 1837-1849 (gerçek Google API çağrısı) · Asıl risk: kimliksiz endpoint'in GERÇEK ama başkasına ait bir purchaseToken ile bombalanıp Google Play Developer API kotasını (RTDN + interaktif doğrulamayla paylaşılan) tüketerek DoS yaratması · Kontrol: Play Developer API günlük kotası ve mevcut marj.

28. [Orta] Faturalama · Geç webhook durumunda kullanıcı deneyimi asimetrik · `scheduledBillingEntitlementReconcile` saatte bir, 2 saatlik tamponla süresi geçmiş abonelikleri düşürüyor — gecikmiş bir "iptal" için doğru yönde ama gecikmiş bir "yenileme" webhook'u için kullanıcı 2 saatlik pencerede planını geçici kaybedebilir · Kanıt: functions/stripeBilling.js:2119-2178 (BILLING_EXPIRY_GRACE_MS = 2h).

29. [Düşük]/verify Faturalama · Apple ortam bayrakları doğru tasarlanmış: APPLE_ALLOW_PRODUCTION_BILLING olmadan Production imzaları hiç doğrulanmıyor (güvenli varsayılan) · Kanıt: functions/stripeBilling.js:410-417 · functions/.env içinde anahtar adı mevcut (değer okunmadı) · Kontrol: Bu bayrak şu an prod'da açık mı — App Store 1.3 submission durumuyla çapraz kontrol edilmeli.

30. [Bilgi] Faturalama · Çapraz-ray çift abonelik engeli çalışıyor (`refuseSecondTill`) · Kanıt: functions/stripeBilling.js:1489-1496.

31. [Düşük] Faturalama · `stripeBilling.js` dosya adına rağmen Apple+Google+Stripe'ın tamamını barındırıyor (2205 satır) — güvenlik açığı değil ama gözden geçirmeyi zorlaştıran bir organizasyon sorunu.

**Cross-Cutting / Hub**

32. [Kritik] Hub · QuickBooks Online ve Xero, native kataloglarında hâlâ "planned" (Coming soon) — oysa web'de "native" ve CANLI · Kanıt: studioflow-web/lib/studioflow/integrations.ts:104,109 (`kind:"native"`) vs EGGcraft/NivaDeskIntegrations.swift:109,111 (`kind:"planned"`) vs studioflow-android/.../IntegrationsHub.kt:168-169 (`"planned"`) · Kullanıcı sorunu: Mac/iPhone/Android'de banka/muhasebe planı olan müşteri "Yakında" kartı görüp bağlanamayacağını düşünür, halihazırda web'de çalışan bir özelliği hiç keşfetmeyebilir.

33. [Orta] Hub · Etiket düzeltilse bile native veri boru hattı eksik · Swift/Kotlin sinyal struct'larında (`NivaDeskIntegrationSignals`/`IntegrationSignals`) QuickBooks/Xero bağlantı durumunu okuyacak bir alan hiç yok · Kanıt: EGGcraft/NivaDeskIntegrations.swift:36-54; studioflow-android/.../IntegrationsHub.kt:56-70.

34. [Yüksek] Hub · "Connected" durumu her sağlayıcı için elle yazılmış, üç dosyada ayrı ayrı senkron tutulan mantıkla türetiliyor · Kanıt: integrations.ts:200-286 vs Swift/Kotlin eşdeğerleri · Bir dal bir platformda güncellenip diğerinde unutulursa (QuickBooks/Xero'da tam olarak bu olmuş), "Connected" etiketi platformdan platforma yalan söyleyebilir.

35. [Orta] Hub · Wix/Squarespace/Zapier/Make gibi farklı sağlayıcılar TEK bir "inbound" webhook kanalını paylaşıyor · Kanıt: studioflow-web/lib/studioflow/integrations.ts:280-286 (`signals.channels.inbound`) · Kullanıcı sorunu: Bir workspace Zapier'den tek bir teslimat aldıysa, aynı workspace'in Wix VEYA Make kartı da yanlışlıkla "Connected" görünebilir — sistemde hangi sağlayıcının gönderdiğini ayıran bir alan yok · Kontrol: inbound payload'ında sağlayıcı-özel bir ayraç var mı?

36. [Kritik] Hub · Entegrasyon secret şifrelemesi tutarsız — sadece Etsy ve Shopify application-level şifreleniyor · `createCipheriv`/`createDecipheriv` yalnızca functions/etsy.js:102,116'da var (Shopify'ın kendi ayrı `shopifyEncryptToken`'ı da var, functions/index.js:29801); functions/bankFeed.js (TrueLayer/Open Banking), functions/accountingFunctions.js + functions/accounting/** (QuickBooks/Xero), functions/squareConnector.js + functions/commerce/square/*, functions/wooConnector.js + functions/commerce/woo/* dosyalarının HİÇBİRİNDE şifreleme çağrısı yok · Somut kanıt: functions/bankFeed.js:253,431 (`refreshToken: cleanText(token.refresh_token, 2000)` — düz metin); functions/accounting/core/store.js:9 yorumu "boxed access/refresh tokens" diyor ama box/unbox fonksiyonu hiçbir yerde tanımlı değil · Kullanıcı sorunu: Firestore yedeğine/dışa aktarımına ya da Admin SDK çalıştıran herhangi bir fonksiyona erişimi olan biri, gerçek banka hesabına erişim veren TrueLayer refresh token'ını ve QuickBooks/Xero/Square/WooCommerce kimlik bilgilerini düz metin okuyabilir · Kontrol: Bilinçli bir öncelik sırası mı (Etsy/Shopify önce yapıldı) yoksa gözden kaçmış mı?

37. [Yüksek] Hub · Etsy dışındaki bağlayıcılarda (Square/WooCommerce/QuickBooks/Xero) sunucu-taraf plan kısıtlaması bulunamadı · `beginEtsyConnect`/`beginSquareConnect` sadece `requireWorkspaceOwner` (rol kontrolü) çağırıyor, `planForCompany`/entitlements'a hiç referans yok · Kanıt: functions/etsyConnect.js:264, functions/squareConnector.js:178 · Karşılaştır: functions/index.js:25571-25577 (saveWorkspaceSmsSettings, plan kontrolü VAR) ve functions/clientDomains.js:243-247 (requestClientDomain, plan kontrolü VAR) · Kontrol edilecek soru: Bir Free Demo workspace sahibi, callable'ı doğrudan çağırarak Etsy/Square/WooCommerce/QuickBooks/Xero bağlayabilir mi — bu kasıtlı bir ürün kararı mı (tüm planlarda bağlantı serbest) yoksa gözden kaçmış bir tutarsızlık mı?

38. [Orta] Hub · Bağlayıcı-özel denetim (audit) günlüğü yok, sadece genel ayar-diff izleme var · `settingsAuditLog`, companySettings dokümanındaki alan değişikliklerini otomatik diff'liyor; Etsy/Square/Woo/QuickBooks/Xero bağlantıları AYRI koleksiyonlarda tutulduğundan bu mekanizma "kim ne zaman hangi entegrasyonu bağladı/kopardı" olayını yakalamıyor · Kanıt: functions/index.js:6056-6070 (auditLogEnabledForCompany) — connect/disconnect callable'larında (etsyConnect.js, squareConnector.js, wooConnector.js, accountingFunctions.js) audit-log çağrısı bulunamadı.

39. [Düşük] Hub · Genel ayar denetim günlüğü bile ücretli bir entitlement'ın arkasında · Free/Lite bir workspace'te hiç denetim izi tutulmuyor olabilir · Kanıt: functions/index.js:6070 (`auditLogEnabled`).

40. [Bilgi] Hub · firestore.rules'taki wildcard-deny örüntüsü çalışıyor ama kırılgan — tam bu şekilde bir örnek (bankAuditLog) daha önce "listeye eklenmeyi unutmak" yüzünden herkese açık kalmış, kodun kendi yorumu bunu itiraf ediyor · Kanıt: firestore.rules:648-655 (yorum), genel wildcard bloğu firestore.rules:813-900.

41. [Orta] Hub · `integrationSecrets`, `fileRecords`, `customerMergeLog`, `settingsAuditLog`, `heldIntegrationOrders` wildcard'dan hariç tutulmuş ama kendi `match` bloğu yok · Kanıt: firestore.rules:852,909 (dışlama listesinde, dedicated rule yok) · Bugün güvenli (varsayılan-red, istemci tarafında bu 5 koleksiyonu okuyan hiçbir kod bulunamadı — web/iOS/Android'de doğrulandı) ama bankAuditLog'un yaşadığı hata sınıfına açık bir tasarım · Öneri: bankAuditLog/trackingResults gibi açık bir `allow read, write: if false` eklenmesi.

42. [Bilgi] Hub · trackingResults ve bankAuditLog için doğru, dedicated kurallar var · Kanıt: firestore.rules:943-946 (`canReadCompany`), firestore.rules:652-655 (`canReadBankFeed`).

43. [Bilgi] Hub · portalLinks/etsyConnections/wooConnections/squareConnections top-level koleksiyonları istemciden açıkça ("if false") kapalı, tutarlı · Kanıt: firestore.rules:1083-1116 · Ama aynı açıklık clientDomains/fileShares/messageLog/trackingLookup/googleBillingAccounts/appleBillingAccounts/stripeBillingEvents/chatgptOAuthCodes için tekrarlanmamış, bunlar sadece "hiç match bloğu yok" (dolaylı varsayılan-red) ile bırakılmış — fonksiyonel olarak eşdeğer ama denetlenebilirlik için önerilir.

44. [Düşük] Hub · Android'de WooCommerce'in dahili `manage` anahtarı ("woo") web/iOS'tan ("woocommerce") farklı ama SettingsScreen.kt içinde doğru eşleniyor — YANLIŞ ALARM, gerçek bug değil · Kanıt: studioflow-android/.../IntegrationsHub.kt:153 + SettingsScreen.kt:687.

45. [Orta] Hub · Şifreleme altyapısı iki kez ayrı ayrı inşa edilmiş (Etsy'nin `encryptToken`/`decryptToken`'ı ve Shopify'ın ayrı `shopifyEncryptToken`'ı) · Kanıt: functions/etsy.js:102 vs functions/index.js:29801 · Ortak bir `functions/crypto/tokenBox.js` yerine iki paralel implementasyon — Bulgu 36'nın "neden diğerlerinde yok" sorusunu daha da ilginç kılıyor, çünkü yetenek zaten iki kez yazılmış.

---

**Önceliklendirilmiş en kritik 3 madde:** (10) placeholder Cloudflare token → özel domain TLS'i hiç kurulmuyor ama arayüz yanlış güven veriyor; (32) QuickBooks/Xero native'de "Coming soon" görünüyor ama gerçekte çalışıyor; (36) banka (TrueLayer) ve muhasebe (QuickBooks/Xero) token'ları uygulama katmanında şifrelenmemiş, sadece Etsy/Shopify şifreli.
