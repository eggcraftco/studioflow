# Web — Dosya yüklemelerinde dosya başına ilerleme (8 Ekim 2026)

Dal: `web-files-progress-2026-10-08` (hostinger/main `7f71fb1d` üzerinden).
Durum: **kod hazır · izole test geçti · ekran kabulü yalnız statik CSS düzeneğiyle · CANLI DEĞİL.**
Hiçbir şey deploy edilmedi; hostinger `main`'e dokunulmadı; üretim Firebase'ine bağlanılmadı.

## 1. Bulunan yükleme giriş noktaları (dosya:satır, bu daldaki son hâl)

Kapsamdakiler — müşteri dosyaları / dosya kütüphanesi / sipariş ekleri:

| Giriş noktası | Depo yolu | Ne yapıyordu | Bu dalda |
|---|---|---|---|
| `lib/studioflow/clientFiles.ts:275` `uploadClientFileForOrder` | `companies/{cid}/client_files/{orderId}/{fileId}.{ext}` | `uploadBytes` → `getDownloadURL` → `appendClientFile` callable | `uploadBytesResumable` (ölçülen bayt), slot ile yeniden deneme, tarama bekleme |
| `lib/studioflow/filesLibrary.ts:160` `uploadLibraryFile` | `companies/{cid}/library/{zamanDamgası}-{ad}` | `uploadBytes` → `registerLibraryFile` | aynı; zaman damgası artık slot'tan |
| `lib/studioflow/filesLibrary.ts:160` `addLibraryFileVersion` | `companies/{cid}/library/{zamanDamgası}-{ad}` | `uploadBytes` → `addLibraryFileVersion` | aynı; yeniden denemede sürüm var mı diye bakar |
| `app/files/page.tsx:225` (klasik yükleme formu) | → clientFiles | tek dosya, "Uploading..." metni | `multiple`, kuyruk paneli |
| `app/orders/OrderDetailContent.tsx:2108` (Client Files kartı, seç + sürükle-bırak) | → clientFiles | dosyalar sırayla, tek durum satırı | kuyruk (2 eşzamanlı), panel |
| `app/orders/OrderDetailContent.tsx:4698` (önizleme görseli Client Files'a aynalama) | → clientFiles | — | **değişmedi** (hooks/slot vermeden çağırır; eski davranış) |
| `app/files/FilesLibraryView.tsx:149,151` (kütüphaneye yükle / yeni sürüm) | → filesLibrary | `run()` ile tek dosya | `multiple`, kuyruk paneli |

Kapsam dışı bırakılan `uploadBytes` çağrıları (dosya kütüphanesi değil; davranışları değişmedi, bu notta yalnız envanter için):
`app/bank/page.tsx:649,722` (banka fişi), `lib/studioflow/inventory.ts:982` (envanter fotoğrafı),
`lib/studioflow/orders.ts:594` (sipariş önizleme görseli, `design_images/`), `lib/studioflow/customers.ts:237`,
`lib/studioflow/workspaceLogo.ts:126`, `lib/studioflow/accountProfile.ts:166`, `lib/studioflow/messages.ts:482`,
`lib/studioflow/notes.ts:197`, `lib/studioflow/supportTickets.ts:306`.
Bu yayın deposunda `beginOrderFileUpload / uploadOrderFileChunk / completeOrderFileUpload` parçalı yolu **yok**; web doğrudan Storage'a yazar.

### Sunucu taraması — istemci sonucu nereden öğreniyor

`scanUploadedFile` (functions/malwareScanTrigger.js) yükleme biter bitmez indirme jetonunu alır ve nesnenin
özel metadata'sına `nvScanStatus`/`nvScanVerdict` yazar (`pending` → `clean`; temiz değilse jeton geri gelmez,
bulaşmışsa nesne silinir). `fileScans` koleksiyonu her iki yönde de sunucuya özeldir (firestore.rules:1417),
dolayısıyla istemcinin bakabileceği tek yer metadata'dır:

- `getMetadata(ref).customMetadata.nvScanStatus === "clean"` → **Uploaded**
- `pending` ya da henüz anahtar yok → **Processing** (İşleniyor), 2,5 sn'de bir sorgu, 45 sn üst sınır
- okuma `storage/unauthorized` (karantina; storage.rules `notQuarantined`) ya da `storage/object-not-found`
  (bulaşmış → silindi) → **Failed**, "This file was blocked by the safety scan and removed.", yeniden deneme yok
- 45 sn sonra hâlâ `pending` → "Uploaded — safety scan still running" (kayıt zaten yazıldı; sunucu kendi bitirir)

`getMetadata` bir okumadır, jeton basmaz; tarama akışına dokunmaz.

## 2. Ne değişti

**Yeni, saf (Firebase/React yok):**
- `lib/studioflow/uploadProgress.ts` — kuyruk reducer'ı (`queued → preparing → uploading → processing → done | error | cancelled`),
  `uploadPercent` (yalnız ölçülen bayt oranı; `uploading` dışında `null`, asla animasyon/tahmin), `uploadBytesLabel`
  ("12.5 MB / 50.0 MB"), `uploadStageLabel`, `nextUploadsToStart` (sınırlı eşzamanlılık), `newUploadSlot`.
- `lib/studioflow/uploadRunner.ts` — `transferTracked` (görevin `state_changed` anlık görüntüsü → ilerleme;
  `offline` olayında `task.pause()` + "Waiting for network", `online`'da `task.resume()`; `AbortSignal` →
  `task.cancel()`; sekme görünür olunca `task.snapshot`'tan satırı tazeleme; `skipIfExists`), `awaitScanVerdict`,
  `scanStateFromMetadata`, `scanStateFromReadError`, `UploadCancelledError`, `UploadBlockedError`.

**Yeni, tarayıcı:**
- `lib/studioflow/storageUploadDeps.ts` — `uploadBytesResumable`, `getMetadata`, `navigator.onLine`, `online/offline`,
  `visibilitychange` bağlayıcıları.
- `lib/studioflow/useUploadQueue.ts` — ekranın kuyruğu: `enqueue(files, context)`, `cancel`, `retry`, `remove`,
  `clearFinished`, `isActive`; 2 eşzamanlı; her satırın slot'u ve AbortController'ı burada tutulur.
- `components/UploadQueuePanel.tsx` — dosya başına satır: ad, aşama etiketi, yüzde + bayt (yalnız `uploading`),
  ilerleme çubuğu (`progress-track/fill`), Cancel / Retry / Remove, hata metni. `globals.css` sonuna `.upload-queue*`
  (mantıksal özellikler, `body[data-studio-theme="dark"]` koyu tema, bayt etiketi `direction:ltr; unicode-bidi:isolate`).

**Değişen:**
- `clientFiles.ts` — `uploadClientFileForOrder` isteğe bağlı `slot` + `progress` alır. Yol, metadata, Firestore kaydı,
  `appendClientFile` yükü, tarama bayrakları **aynı**. Yeniden denemede (`slot.attempt > 1`): nesne yoldaysa baytlar
  tekrar gönderilmez; sipariş belgesinde aynı `fileId` varsa `appendClientFile` tekrar çağrılmaz (sunucu zaten id'ye göre
  değiştiriyor — bu yalnız ikinci "Client file uploaded" geçmiş satırını önler). Tarama bekleme `withWebSyncStatus`
  dışında (senkron göstergesi 45 sn "saving" demesin). `progress` verilmeyen çağrı eskisi gibi tek deneme, tarama bekleme yok.
- `filesLibrary.ts` — yol zaman damgası `slot.createdAtMs`; `registerLibraryFile` zaten `{existed:true}` döner
  (sha1(yol) kayıt kimliği); `addLibraryFileVersion` sunucuda her çağrıda sürüm ittiği için yeniden denemede
  `listLibraryFiles` ile sürüm var mı bakılır. Kütüphane kuralı yalnız `create` izni verdiğinden "nesne varsa atla"
  burada şart.
- `app/files/page.tsx`, `app/orders/OrderDetailContent.tsx`, `app/files/FilesLibraryView.tsx` — kuyruk + panel;
  dosya seçiciler `multiple`; sipariş kartında yükleme düğmesi kuyruk çalışırken kapanmaz (daha fazla dosya eklenebilir),
  politika kutusu kuyruk aktifken kilitli; `actioningFileId === "upload"` kullanımı kalktı (diğer eylemlerin kilidi aynı).
- `lib/studioflow/language.ts` — 9 yeni anahtar × 11 dil (`Preparing`, `Uploading`, `Uploaded`,
  `Uploaded — safety scan still running`, `Waiting for network`, `Clear finished`, engellendi cümlesi,
  `Upload cancelled.`, `Upload failed. Please try again.`). Var olanlar yeniden kullanıldı: `Queued`, `Processing`,
  `Failed`, `Cancelled`, `Retry`, `Cancel`, `Remove`, `Uploads`.
- `package.json` — `test:upload-progress`, `test:upload-translations`.

**Yeniden deneme = aynı dosya, ikinci kayıt yok.** Slot kuyruğa alınırken bir kez üretilir (`id` = fileId / depo adı,
`createdAtMs` = kütüphane yolu damgası) ve her denemede aynı kalır. Testte: 1. deneme baytları yazar, kayıt adımı
patlar; 2. deneme aynı yola gider, `startUpload` çağrılmaz, tam **bir** kayıt oluşur.

**Sınırlar (dürüst):** Firebase web SDK'sı ağ koptuğunda görev içinde kendi yeniden denemesini yapar; uzun kesintide
görev `storage/retry-limit-exceeded` ile düşer ve satır **Failed + Retry** olur — Retry aynı yola baştan yükler
(SDK oturum URL'sini saklamaz; "kaldığı yerden" devam yoktur). İptal, callable adımları sırasında anında kesmez
(plan kontrolünden sonra ve aktarımdan önce kontrol edilir; tarama beklemesinde iptal yalnız izlemeyi bırakır —
dosya zaten yüklenmiştir). Sayfadan ayrılmak kuyruğu unutur ama başlamış SDK görevini durdurmaz.

## 3. Doğrulama

| Adım | Sonuç |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | temiz |
| `npm run test:upload-progress` | **80/80** — reducer (aşamalar, yüzde yalnız ölçülünce, geç olaylar yok sayılır, retry/clear), runner sahte görevle (ilerleme = görev anlık görüntüsü; çevrimdışı → pause/`Waiting for network` → online → resume, tek pause/tek resume; iptal → `task.cancel()` + `UploadCancelledError`; SDK hatası olduğu gibi geçer; tarama pending→clean / blocked→`UploadBlockedError` / zaman aşımı→unknown), yeniden denemede ikinci dosya yok (1 yükleme, 1 kayıt), kaynak doğrulamaları (fileId = slot.id, `Date.now()` yolda yok, 3 ekranda panel + slot/progress) |
| `npm run test:upload-translations` | 17 cümle × 12 dil; derlenmiş tablodan `studioT` probu (Uploading→Yükleniyor, Processing→İşleniyor) |
| `npx tsx` probu (scratch) | 17 anahtar Türkçe + Arapça döndü (ör. `Waiting for network → Ağ bekleniyor / في انتظار الشبكة`) |
| Mevcut suite'ler | `test:inbox-translations` 221, `test:ui-workspace-translations` 54, `test:plan-order-usage` 39/39, `test:home-cards` 159, `test:customer-card` 58 — hepsi geçti |
| `npm run build` (hostinger-build.mjs → `next build`) | `NEXT_BUILD_EXIT code 0`, 63 sn; uyarılar yalnız eskiden var olan `integrations.module.css` autoprefixer satırları |

## 4. Ekran kabulü — ne test edildi, ne edilmedi

**Statik CSS düzeneği (Chrome for Testing 155, `npx @puppeteer/browsers`, scratch dizininde; sahibin Chrome'u açılmadı):**
panelin birebir işaretlemesi + `globals.css`, 375 px genişlikte, üç varyant: İngilizce açık, Türkçe koyu, Arapça koyu `dir=rtl`.
Ölçüm `scrollWidth 375 = clientWidth 375`, **yatay taşma yok**; uzun dosya adı üç noktayla kesiliyor; koyu temada çubuk
zemin/dolgu okunuyor; RTL'de satır aynalanıyor, dolgu sağdan büyüyor, bayt etiketi "12.5 MB / 50.0 MB" düzgün sırada.

**Ekranda test EDİLMEDİ (gerçek uygulama akışı):** Firebase'e bağlı canlı yükleme, gerçek `uploadBytesResumable`
ilerlemesi, çevrimdışı/çevrimiçi geçişi, iptal, yeniden deneme, tarama "Processing → Uploaded" geçişi, sekme arka plana
alınması; sipariş kartı/kütüphane sayfası içinde panelin yerleşimi. Bunlar emülatör yığını + QA girişi gerektirir
(`dev-web-full-emulator-stack`, `emulator-web-qa-login` notları); bu oturumda üretime bağlanmama kuralı gereği
yapılmadı. Reducer/runner davranışı birim testle, görünüm statik düzenekle kanıtlandı.

## 5. Native karşılıkları (bu oturumda DOKUNULMADI — native ajan için)

Ana depo `macbook-save-before-macstudio-2026-06-01` @ `58e17f11` üzerinde bakıldı:

**iOS / macOS (EGGcraft):**
- `EGGcraft/FirebaseManager.swift:1942` `uploadClientFile(fileURL:orderId:source:completion:)` — `putData` görevi
  (`:2130` `let uploadTask = storageRef.putData(...)`); `uploadTask.observe(.progress)` ile bayt/toplam alınabilir,
  `pause/resume/cancel` var. Aşama etiketleri + tarama için `getMetadata` sorgusu eklenmeli.
- `EGGcraft/SiparisDetayView.swift:9171` `uploadClientFilesSequentially(_:index:)` — sıralı çoklu yükleme; satır başına durum yok.
- `EGGcraft/ContentView.swift:20660` `uploadFileToTargetOrder(_:)` — Dosyalar sekmesinden hedef siparişe yükleme.
- `EGGcraft/FirebaseManager.swift:1828` `uploadDesignImage` (`:1909` `putData`) — önizleme görseli; web'de de kapsam dışı bırakıldı.
- Kütüphane (`registerLibraryFile` / `addLibraryFileVersion`) çağrısı bu dalda iOS'ta **bulunamadı**.

**Android:**
- `studioflow-android/.../data/firebase/StudioFlowRepository.kt:1452` `suspend fun uploadClientFile(...)` — `ref.putBytes(...)`
  (`:1492`); `addOnProgressListener { bytesTransferred / totalByteCount }` + `pause/resume/cancel` eklenmeli.
- `.../features/shell/StudioFlowViewModel.kt:721` `uploadClientFile(order, bytes, ...)` — UI durumu burada; dosya başına satır yok.
- `.../features/orders/OrderDetailScreen.kt:11490` `uploadClientFileFromUri(...)` — seçici → ViewModel.
- Kütüphane çağrısı bu dalda Android'de de **bulunamadı**.

Her ikisinde de aynı kural geçerli olmalı: yeniden denemede fileId/yol sabit, kayıt adımından önce var-mı kontrolü,
tarama sonucu yalnız nesne metadata'sından (`nvScanStatus`), `fileScans` okunamaz.

## 6. Rapor

- Kod hazır: **evet** (dal `web-files-progress-2026-10-08`, hostinger'a push'landı; `main` değişmedi)
- İzole test: **evet** (80 + 17×12; mevcut 5 suite; tsc; build)
- Ekran kabulü: **kısmi** — yalnız statik CSS düzeneği (375 px, koyu, RTL); uygulama içi akış ekranda test edilmedi
- Canlı: **HAYIR**
