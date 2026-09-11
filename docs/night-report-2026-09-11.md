# Gece çalışma raporu — 11 Eylül 2026 (operatör uyurken, yetkili kapsam)

Yetki: 11 Eyl gece mesajı (6 madde; mevcut pilot dışında yeni production deploy ve genel açılış onayı YOK; OpenAI inceleme
yüzeyi, review hesabı, Stripe ve eBay bağlantı ayarları korunur; gerçek posta kutusuna erişim, mesaj gönderme, sağlayıcı hesabı,
DNS/secret değişikliği yok; test kayıtları silinmez; token/secret/parola kayda girmez). Bu dosya vardiya boyunca güncellendi;
son güncelleme 03:08Z.

## Sabah özeti

**Canlıda değişen:** hiçbir şey. Gece boyunca deploy, rules/index yayını, secret, DNS, mağaza gönderimi yapılmadı.
Canlı pilot (retention in-app, tek workspace) ve gece 02:20Z'de açılan durum aynen duruyor.

**Hazır ama yayınlanmamış (aday dallar, hepsi push'lu, CI'lı):**
1. **Retention e-posta aşaması** — `retention-email-candidate` @ `3d02ef73` (kod `3670c58e`); CI functions-tests + dependency-audit yeşil.
2. **Funnel mağaza bağlantıları** — `funnel-store-connections` @ `90bab7a2` (kod `ea0ce5d0`); CI yeşil; dry run: 66 workspace, integration_connected 0→3, activated 10→10.
3. **Native feedback ekranları** — `native-feedback-screens` (worktree `~/Developer/studioflow-native-feedback`); sonuç §3'te.

**Sabah kararı bekleyenler (önerilen seçenek önce):**
1. **eBay 260910-000068:** eBay Sandbox'ta sipariş oluşturmanın çalışmadığını, ETA olmadığını ve production'da test (Test Listings Policy) önerdiğini yazdı. Seçenekler `docs/ebay-manual-stage-2026-09-10.md` §2m: (1) *önerilen* — production keyset ile tek bir test ilanı/siparişi için ayrı, dar kapsamlı bir onay paketi hazırlansın (bağlantı ayarları ve read-only kapsamlar değişmeden); (2) Sandbox'ı bekle (ETA yok); (3) hattı kapat. Yanıt taslağı hazır, gönderilmedi.
2. **Retention e-posta:** deploy edilsin mi? *Önerilen: şu an değil* — önce 7 karar (`docs/onboarding/retention-email-candidate-2026-09-11.md` §5): gönderici kimliği (contact@nivadesk.co.uk, önerilen), yanıt adresi (aynı kutu), poller için posta kutusu erişimi (pilotta mevcut SMTP secret'ı; genel açılıştan önce ayrı kutu + ayrı secret), aktivasyonun founder notunu durdurup durdurmayacağı (önerilen: durdurmasın), `NIVADESK_RETENTION_TOKEN_SECRET` (operatör oluşturur; e-posta öncesi şart), poll sıklığı (saatlik), Hostinger IMAP host/port teyidi. IMAP değerlendirmesi: pilot ölçeğinde uygun, sağlayıcıya tercih edilir (§3).
3. **Funnel adayı:** `getActivationFunnel` bu dalın kodundan yeniden deploy edilsin mi? *Önerilen: evet, tek fonksiyon, ayrı deploy* (v2.1 cutover'daki gibi; dry run'da 0 durum değişikliği, yalnız integration_connected sayımı düzelir).
4. **Native feedback:** (a) `platform` alanını kabul eden küçük sunucu değişikliği (6 feedback callable, aynı .env) deploy edilsin mi — *önerilen: evet*, aksi halde native notlar inbox'ta "web" görünür; (b) mağaza sürüm kadansı — bu dal hiçbir sürümü zorlamıyor; (c) mağaza build'inden önce Mac uygulamasından test workspace'iyle tek elle gönderim (operatör oturumu gerekir).
5. **Retention pilot takibi (beklemede, izleyici yok):** ≈23:20Z'deki sweep → kart → Not now → CTA → sentetik siparişin geri alınması → `goal_met`. Sentetik sipariş çöp kutusunda, işaretli; hiçbir şey silinmedi.
6. **Google 75151719:** operatörün 11:00Z'de ilettiği yazışma: Murali son kanıtları Product Specialist ekibine aktardı, durum güncellemesi en geç **15 Eyl 2026 22:30 IST / 17:00 UTC**. Vaka çözülmedi, Control 3 açık, yeni mesaj/test gerekmiyor. (Gece: salt-okunur kontrol mümkün olmadı (console destek sayfası bu Chrome profilinde render olmadı; Cloud Support API projede kapalı — açmak proje değişikliği, yapılmadı). Son bilinen durum: yanıt 10 Eyl ~11:50Z gönderildi, Product Specialist bekleniyor. Sabah console/e-posta dizisinden bakılmalı.
7. **OpenAI 1.2.0:** hâlâ **Review** (02:5xZ okuma: 1.2.0 Review, 1.1.1 Rejected, 1.0.0 Published). Cevaplanacak mesaj yok.

| Madde | Tamamlanan | Commit/branch | Test kanıtı | Canlı durum | Kalan | Sabah kararı |
|---|---|---|---|---|---|---|
| 1. Retention pilot takibi | 02:20:59Z ilk sweep okundu: evaluated 1, skipped not_in_pilot 62 / excluded 3, sent 0, tek aday founder_intro (e-posta) flag_off. Pilot workspace'te retention state yok, açık kart yok (henüz bir şey due değil). Sentetik sipariş `siparisler/YFFB4Xqi8zSfFgPEN48t`: isDeleted true, deletedAt 02:20:55Z, retentionPilotNote var. Damga/cooldown/kural değiştirilmedi. | — (kayıt hand-off'ta) | canlı log + Firestore okuma | pilot aynen canlı | ≈23:20Z adımları (kalıcı izleyici yok) | #5 |
| 2. Pilot işletme/rollback belgesi | Önceki turda tamamlanmıştı (`docs/onboarding/retention-wiring-2026-09-10.md` §8: scheduler duraklatma = dondurma, `IN_APP` unset = kartları gizleme, tam kapatma/yeniden açma komutları, ticket callable'ları için trafik geri alma). Hiçbir rollback uygulanmadı. | `37025406` | — | — | — | — |
| 3. Retention e-posta adayı | Canlı tabandaki 7 boşluk kapatıldı: konu etiketi `[NV-<key>]`, notun Message-ID'si anahtarın yanında (etiket düşerse In-Reply-To ile eşleşme), Message-ID başına tek inbound kayıt (aynı posta iki kez işlenmez), outbox yeniden denemeden önce yeniden yargı (opt-out / yanıt / destek vakası / iptal / kurulum notları için aktivasyon), gönderen kutu yanıt adresi, salt-okunur saatlik IMAP poller `retentionInboundPoll` (INBOUND=1 + INBOUND_MODE=imap), `imapflow ^1.7.8`. IMAP uygunluk değerlendirmesi + deploy listesi + rollback + 7 karar belgede. | `retention-email-candidate` @ `3d02ef73` (kod `3670c58e`); kayıt deploy dalına cherry-pick `86d519a6` | rules 17 / writer 18 / wiring 7 / poller 4; tam `npm test` exit 0; CI yeşil | deploy edilmedi; EMAIL/INBOUND unset | secret + 7 karar | #2 |
| 4. Native feedback ekranları | Mac/iOS (tek hedef) + Android: hesap menüsünde "Send feedback" (sunucu `getFeedbackPrompt.enabled` diyorsa; 10 dk önbellek), web ile aynı kısa form ve teşekkür ekranı, aynı callable'lar, 22 anahtar × 11 dil iki native sözlükte (web tablosundan üretildi, çift anahtar 0). Davet kartı YOK (kapsam gereği). Sunucu adayı: `submitFeedback` `platform` alanını kabul eder (web|mac|ios|android, varsayılan web) + test. Belge: `docs/onboarding/native-feedback-screens-2026-09-11.md` | `native-feedback-screens` | macOS `xcodebuild` BUILD SUCCEEDED (ilk deneme `import Combine` eksikliğiyle düştü, düzeltildi); iOS simulator BUILD SUCCEEDED; Android `compileDebugKotlin` + `assembleDebug` BUILD SUCCESSFUL (debug APK 37,5 MB, yüklenmedi); feedback.test.js 16 PASS; **canlı gönderim testi yapılmadı** (imzasız build'de oturum yok; sabah operatör oturumuyla Mac'ten tek gönderim) | deploy/sürüm yok | mağaza kadansı; Mac'ten elle gönderim | #4 |
| 5. Funnel mağaza bağlantıları | `getActivationFunnel` snapshot'ı beş mağaza koleksiyonunu okuyor; wiring testi +1; dry run kayıtlı. | `funnel-store-connections` @ `90bab7a2` (kod `ea0ce5d0`) | activation-funnel-wiring 8/8; CI yeşil | deploy edilmedi | — | #3 |
| 6. eBay / Google / OpenAI | eBay: yanıt değerlendirildi, hand-off "yanıt geldi, değerlendirildi", yanıt taslağı hazır (§2m), yeni test yok. Google: kontrol mümkün olmadı (yukarıda). OpenAI: Review, değişiklik yok. | hand-off `08b6a4bb` | — | — | — | #1, #6, #7 |

## Zaman çizelgesi (UTC)
- 02:20Z — retention pilot canlı (önceki tur); 02:20:59Z ilk sweep.
- 02:4xZ — e-posta adayı: son başarısız test düzeltildi (In-Reply-To'da transportun döndürdüğü Message-ID), debug satırı kaldırıldı; IMAP poller + 4 test yazıldı; imapflow eklendi; index.js outbox recheck + yanıt adresi + `retentionInboundPoll`; wiring testi +2; tam suite exit 0.
- 02:5xZ — commit `3670c58e`, kayıt `3d02ef73`, push; CI yeşil. Deploy dalı: kayıt cherry-pick + hand-off (`6a9dab86`). OpenAI/Google salt-okunur kontrol; hand-off `08b6a4bb`.
- 03:0xZ — native feedback worktree açıldı; sunucu `platform` alanı + test; Swift model/sheet/menü/çeviri (22 anahtar × 11 dil, çift anahtar taraması 0); Android dialog/repository/menüler/çeviri.
- 03:1xZ — Mac build 1: FAILED (Combine import) → düzeltme → BUILD SUCCEEDED; Android compileDebugKotlin BUILD SUCCESSFUL (worktree için local.properties + google-services.json kopyalandı, ignored). Commit `c0deb2ba`, push.
- 03:2xZ — iOS simulator BUILD SUCCEEDED; Android assembleDebug BUILD SUCCESSFUL; native kayıt tamamlandı. Hand-off + bu rapor güncellendi (03:14Z). Deploy/sürüm/mağaza gönderimi YOK.
